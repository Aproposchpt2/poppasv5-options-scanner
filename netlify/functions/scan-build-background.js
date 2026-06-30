// POPPAS PRO v3 — RAW MONTHLY-CHAIN FIRST SCAN BUILDER.
// ETL rule: only keep monthly third-Friday option-chain records whose DTE falls within 15-45 days.
// The ETL no longer pre-filters by ROC, probability, delta band, IV, OI, bid/ask spread, positive credit, or pass/fail.
// Scanner/readout filters decide which generated condor candidates are displayed.

import { getStore } from "@netlify/blobs";

const CHUNK = 24;
const CONCURRENCY = 3;
const MAX_RUN_MS = 12 * 60 * 1000;
const SP500_CSV = "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv";

const MIN_MONTHLY_OI    = 10000;
const MIN_SHORT_LEG_OI  = 500;
const MIN_LONG_LEG_OI   = 100;
const MAX_ALL_LEG_SPREAD = 0.05;

const CURATED = [
  ["NVDA","NVIDIA","Technology","both"],["TSLA","Tesla","Consumer Disc.","both"],["AMD","Advanced Micro Devices","Technology","both"],
  ["AAPL","Apple","Technology","both"],["MSFT","Microsoft","Technology","both"],["META","Meta Platforms","Communications","both"],
  ["AMZN","Amazon","Consumer Disc.","both"],["GOOGL","Alphabet","Communications","both"],["AVGO","Broadcom","Technology","both"],
  ["NFLX","Netflix","Communications","both"],["MU","Micron","Technology","both"],["MRVL","Marvell","Technology","both"],
  ["QCOM","Qualcomm","Technology","both"],["AMAT","Applied Materials","Technology","both"],["LRCX","Lam Research","Technology","both"],
  ["KLAC","KLA Corp","Technology","both"],["INTC","Intel","Technology","both"],["ON","ON Semiconductor","Technology","both"],
  ["ENPH","Enphase","Technology","both"],["FSLR","First Solar","Technology","both"],["SMCI","Super Micro","Technology","both"],
  ["PLTR","Palantir","Technology","both"],["ADBE","Adobe","Technology","both"],["PANW","Palo Alto Networks","Technology","both"],
  ["CRWD","CrowdStrike","Technology","both"],["ABNB","Airbnb","Consumer Disc.","both"],["SBUX","Starbucks","Consumer Disc.","both"],
  ["BKNG","Booking","Consumer Disc.","both"],["MRNA","Moderna","Health Care","both"],["COST","Costco","Consumer Staples","both"],
  ["COIN","Coinbase","Financials","both"],["APP","AppLovin","Technology","both"],["DASH","DoorDash","Consumer Disc.","both"],
  ["CSCO","Cisco","Technology","both"],["TMUS","T-Mobile","Communications","both"],["AMGN","Amgen","Health Care","both"],
  ["GILD","Gilead Sciences","Health Care","both"],["PEP","PepsiCo","Consumer Staples","both"],["MDLZ","Mondelez","Consumer Staples","both"],
  ["MSTR","Strategy","Technology","ndx"],["MARA","MARA Holdings","Financials","ndx"],["RIOT","Riot Platforms","Financials","ndx"],
  ["SOFI","SoFi Technologies","Financials","ndx"],["DKNG","DraftKings","Consumer Disc.","ndx"],["ARM","Arm Holdings","Technology","ndx"],
  ["ROKU","Roku","Communications","ndx"],["HOOD","Robinhood","Financials","ndx"],["SNOW","Snowflake","Technology","ndx"],
  ["DDOG","Datadog","Technology","ndx"],["PDD","PDD Holdings","Consumer Disc.","ndx"],["AFRM","Affirm","Financials","ndx"],
  ["RBLX","Roblox","Communications","ndx"]
];

const cboeUrl  = s => `https://cdn.cboe.com/api/global/delayed_quotes/options/${s}.json`;
const parseOcc = s => { const m = String(s || "").match(/^([A-Z]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/); return m ? { y: 2000 + +m[2], mo: +m[3], d: +m[4], type: m[5], strike: +m[6] / 1000 } : null; };
const dteOf    = (y, mo, d, now) => Math.round((Date.UTC(y, mo - 1, d) - now) / 864e5);
const isThirdFriday = (y, mo, d) => { const x = new Date(Date.UTC(y, mo - 1, d)); return x.getUTCDay() === 5 && d >= 15 && d <= 21; };
const ivPct    = v => (v > 1.5 ? v : v * 100);
const widthsFor = spot => spot < 250 ? [5, 10] : [10, 5];
const sleep    = ms => new Promise(r => setTimeout(r, ms));
const json     = o => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
const hasNum   = v => Number.isFinite(+v);
const bid      = o => hasNum(o.bid) ? +o.bid : 0;
const ask      = o => hasNum(o.ask) ? +o.ask : 0;
const mid      = o => +((bid(o) + ask(o)) / 2).toFixed(2);
const round2   = n => Number.isFinite(+n) ? +(+n).toFixed(2) : null;

function expectedMoveFields(spot, iv, dte, shortPut, shortCall) {
  const s = +spot, v = +iv, d = +dte;
  if (!Number.isFinite(s) || !Number.isFinite(v) || !Number.isFinite(d) || s <= 0 || v <= 0 || d <= 0) {
    return { expectedMove: null, expectedLow: null, expectedHigh: null, expectedMoveStatus: "Verify" };
  }
  const move = +(s * (v / 100) * Math.sqrt(d / 365)).toFixed(2);
  const low = +(s - move).toFixed(2);
  const high = +(s + move).toFixed(2);
  let status = "Review";
  const put = +shortPut, call = +shortCall;
  if (Number.isFinite(put) && Number.isFinite(call)) {
    const buffer = Math.max(move * 0.10, s * 0.005);
    if (put < low && call > high) status = "Outside EM";
    else if (put >= low + buffer || call <= high - buffer) status = "Inside EM";
    else status = "Near EM";
  }
  return { expectedMove: move, expectedLow: low, expectedHigh: high, expectedMoveStatus: status };
}

function parseCsvLine(ln) { const r = []; let cur = "", q = false; for (const ch of ln) { if (ch === '"') q = !q; else if (ch === "," && !q) { r.push(cur); cur = ""; } else cur += ch; } r.push(cur); return r; }

async function loadUniverse() {
  try {
    const r = await fetch(SP500_CSV);
    if (!r.ok) throw new Error("csv " + r.status);
    const lines = (await r.text()).split(/\r?\n/).filter(Boolean);
    lines.shift();
    const override = Object.fromEntries(CURATED.map(([s, , , m]) => [s, m]));
    const seen = new Set(), uni = [];
    for (const ln of lines) {
      const f = parseCsvLine(ln);
      const sym = (f[0] || "").trim().toUpperCase();
      if (!sym || sym.includes(".")) continue;
      if (seen.has(sym)) continue; seen.add(sym);
      uni.push([sym, (f[1] || sym).trim(), (f[2] || "S&P 500").trim(), override[sym] || "sp"]);
    }
    for (const c of CURATED) if (!seen.has(c[0])) { uni.push(c); seen.add(c[0]); }
    return uni.length >= 50 ? uni : CURATED;
  } catch (_) { return CURATED; }
}

async function loadEarnings(days = 90) {
  const map = {}, base = Date.now(), queue = [];
  for (let i = 0; i <= days; i++) queue.push(new Date(base + i * 864e5).toISOString().slice(0, 10));
  async function worker() {
    while (queue.length) {
      const d = queue.shift();
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
      try {
        const r = await fetch("https://api.nasdaq.com/api/calendar/earnings?date=" + d, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Accept": "application/json, text/plain, */*" }, signal: ctrl.signal });
        if (r.ok) { const j = await r.json(); for (const row of ((j.data && j.data.rows) || [])) { const s = (row.symbol || "").toUpperCase().trim(); if (s && (!map[s] || d < map[s])) map[s] = d; } }
      } catch (_) {} finally { clearTimeout(t); }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  return map;
}

async function fetchSym(sym, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(cboeUrl(sym), { headers: { "User-Agent": "Mozilla/5.0" }, signal: ctrl.signal });
      if (r.ok) { const j = await r.json(); clearTimeout(t); return j.data || j; }
    } catch (_) {} finally { clearTimeout(t); }
    await sleep(450 + Math.random() * 350);
  }
  return null;
}

function nearestByStrike(set, type, target) {
  let b = null, bd = Infinity;
  for (const o of set) {
    if (o.type !== type) continue;
    const d = Math.abs(o.strike - target);
    if (d < bd) { bd = d; b = o; }
  }
  return b;
}

// Raw monthly-chain first: the only chain-level filters are DTE 15-45 and monthly third Friday.
// Candidate generation then builds broad defined-risk condors from every OTM short put/call pair with available wings.
function scanAll(ch, sym, name, sector, market, now, earningsMap = {}, todayStr = "") {
  if (!ch || !Array.isArray(ch.options)) return [];
  const spot = ch.current_price;
  const monthly = [];
  for (const o of ch.options) {
    const p = parseOcc(o.option); if (!p) continue;
    const dte = dteOf(p.y, p.mo, p.d, now);
    if (dte < 15 || dte > 45) continue;
    if (!isThirdFriday(p.y, p.mo, p.d)) continue;
    monthly.push({ ...o, type: p.type, strike: p.strike, dte, ek: `${p.y}-${String(p.mo).padStart(2,"0")}-${String(p.d).padStart(2,"0")}` });
  }
  if (!monthly.length) return [];

  const byExp = {}; monthly.forEach(o => { (byExp[o.ek] = byExp[o.ek] || []).push(o); });
  const out = [];

  for (const ek of Object.keys(byExp)) {
    const set = byExp[ek];
    const monthlyOI = set.reduce((s, o) => s + (o.open_interest || 0), 0);
    const calls = set.filter(o => o.type === "C" && o.strike > spot).sort((a,b) => a.strike - b.strike);
    const puts  = set.filter(o => o.type === "P" && o.strike < spot).sort((a,b) => b.strike - a.strike);
    const erDate = earningsMap[sym] || null;
    const earnInWindow = !!(erDate && erDate >= todayStr && erDate <= ek);

    for (const widthTarget of widthsFor(spot)) {
      const putStructures = [];
      const callStructures = [];
      for (const sp of puts) {
        const lp = nearestByStrike(set, "P", sp.strike - widthTarget);
        if (!lp || lp.strike >= sp.strike) continue;
        putStructures.push({ sp, lp });
      }
      for (const sc of calls) {
        const lc = nearestByStrike(set, "C", sc.strike + widthTarget);
        if (!lc || lc.strike <= sc.strike) continue;
        callStructures.push({ sc, lc });
      }

      for (const ps of putStructures) {
        for (const cs of callStructures) {
          const { sp, lp } = ps, { sc, lc } = cs;
          const callW = +(lc.strike - sc.strike).toFixed(2), putW = +(sp.strike - lp.strike).toFixed(2);
          if (callW <= 0 || putW <= 0) continue; // structural integrity only, not a scanner band filter
          const width = Math.max(callW, putW);
          const credit = round2((bid(sc) + bid(sp)) - (ask(lc) + ask(lp)));
          const midCredit = round2((mid(sc) + mid(sp)) - (mid(lc) + mid(lp)));
          const maxRisk = width - credit;
          const roc = Number.isFinite(maxRisk) && maxRisk !== 0 ? credit / maxRisk * 100 : -999;
          const iv = Math.max(ivPct(sc.iv || 0), ivPct(sp.iv || 0));
          const putDelta = Math.abs(+sp.delta || 0), callDelta = Math.abs(+sc.delta || 0);
          const putProbOtm = +(1 - putDelta).toFixed(3), callProbOtm = +(1 - callDelta).toFixed(3);
          const probOtm = Math.min(putProbOtm, callProbOtm);
          const spreadMax = +Math.max(ask(sc) - bid(sc), ask(sp) - bid(sp), ask(lc) - bid(lc), ask(lp) - bid(lp)).toFixed(2);
          const shortPutOI = sp.open_interest || 0, shortCallOI = sc.open_interest || 0;
          const longPutOI = lp.open_interest || 0, longCallOI = lc.open_interest || 0;

          const checks = {
            roc: roc >= 5 && roc <= 30,
            monthlyLiquidity: monthlyOI >= MIN_MONTHLY_OI,
            shortLegLiquidity: shortPutOI >= MIN_SHORT_LEG_OI && shortCallOI >= MIN_SHORT_LEG_OI,
            longLegLiquidity: longPutOI >= MIN_LONG_LEG_OI && longCallOI >= MIN_LONG_LEG_OI,
            iv: iv >= 40,
            probOtm: putProbOtm >= 0.90 && callProbOtm >= 0.90,
            spread: spreadMax <= MAX_ALL_LEG_SPREAD
          };
          const misses = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
          const passed = misses.length === 0;
          const em = expectedMoveFields(spot, iv, sc.dte, sp.strike, sc.strike);

          out.push({
            symbol: sym, name, sector, market: market || "both",
            iv: +iv.toFixed(1), hv: +iv.toFixed(1),
            earnings: earnInWindow, earningsDate: earnInWindow ? erDate : null, nextEarnings: erDate,
            dte: sc.dte, expiry: ek,
            credit, midCredit, width,
            probOtm: +probOtm.toFixed(3), putProbOtm, callProbOtm,
            shortDelta: +Math.max(putDelta, callDelta).toFixed(3),
            openInterest: monthlyOI, shortPutOI, shortCallOI, longPutOI, longCallOI,
            spreadMax, spot: +(+spot).toFixed(2),
            expectedMove: em.expectedMove, expectedLow: em.expectedLow, expectedHigh: em.expectedHigh, expectedMoveStatus: em.expectedMoveStatus,
            shortCall: sc.strike, shortPut: sp.strike, longCall: lc.strike, longPut: lp.strike,
            passed, score: Object.keys(checks).length - misses.length,
            rawChainEligible: true,
            rawChainRule: "monthly third-Friday expiration, 15-45 DTE only",
            note: passed ? "Matches primary filters ✓" : ("Needs review: " + misses.join(", "))
          });
        }
      }
    }
  }
  return out;
}

async function writeBoard(store, state, earningsOk, complete) {
  const rows = state.rows.slice().sort((a, b) => (b.passed - a.passed) || (b.score - a.score) || ((b.roc || 0) - (a.roc || 0)) || ((b.credit || 0) - (a.credit || 0)));
  await store.setJSON("latest", {
    strategy: "SP500_Tight_Condor_Scan_v3_RawMonthlyFirst",
    scanMode: "Live · Monthly 15-45 DTE raw-chain-first · CBOE EOD (delayed) · v3 framework" + (complete ? "" : " · building…"),
    dataSource: "CBOE free delayed/EOD quotes; ETL only keeps monthly 15-45 DTE records before scanner filtering",
    generatedAt: new Date().toISOString(),
    universeCount: state.total, scanned: state.scanned, withCondor: rows.length,
    rawMonthlyChainRule: "Only monthly third-Friday option-chain records with DTE 15-45 are extracted before scanner filters.",
    etlNotFilteredBy: ["ROC", "probability", "delta band", "IV", "open interest", "bid/ask spread", "positive credit", "earnings", "pass/fail"],
    passCount: rows.filter(r => r.passed).length,
    earningsShield: earningsOk ? "active (Nasdaq calendar)" : "source unavailable — verify on platform",
    earningsFlagged: rows.filter(r => r.earnings).length,
    probabilityDisclosure: "Anchor-leg probability only; not guaranteed whole-condor probability.",
    building: !complete, progress: { scanned: state.scanned, total: state.total },
    results: rows
  }).catch(() => {});
}

export default async (req) => {
  const store = getStore("poppas-scan");
  const isContinue = (() => { try { return new URL(req.url).searchParams.get("continue") === "1"; } catch (_) { return false; } })();
  const t0 = Date.now();
  const d = new Date();
  const now = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const todayStr = new Date(now).toISOString().slice(0, 10);

  let state = await store.get("build", { type: "json" }).catch(() => null);

  if (!isContinue) {
    if (state && state.status === "running" && (Date.now() - new Date(state.updatedAt).getTime()) < 4 * 60 * 1000) {
      return json({ ok: true, note: "already running", scanned: state.scanned, total: state.total });
    }
    const universe = await loadUniverse();
    const earnings = await loadEarnings(90);
    state = { status: "running", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), total: universe.length, scanned: 0, pendingIdx: 0, universe, earnings, rows: [] };
    await store.setJSON("build", state);
  }
  if (!state) return json({ ok: false, note: "no state" });

  const { universe, earnings } = state;
  const earningsOk = Object.keys(earnings || {}).length > 0;

  while (state.pendingIdx < state.total && (Date.now() - t0) < MAX_RUN_MS) {
    const batch = universe.slice(state.pendingIdx, state.pendingIdx + CHUNK);
    const queue = [...batch];
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const [sym, name, sector, market] = queue.shift();
        const ch = await fetchSym(sym);
        state.scanned++;
        if (ch) { for (const row of scanAll(ch, sym, name, sector, market, now, earnings, todayStr)) state.rows.push(row); }
        await sleep(120 + Math.random() * 260);
      }
    }));
    state.pendingIdx += batch.length;
    state.updatedAt = new Date().toISOString();
    await store.setJSON("build", state);
    await writeBoard(store, state, earningsOk, false);
  }

  if (state.pendingIdx >= state.total) {
    state.status = "complete"; state.updatedAt = new Date().toISOString();
    await store.setJSON("build", state);
    await writeBoard(store, state, earningsOk, true);
    return json({ ok: true, status: "complete", scanned: state.scanned, withCondor: state.rows.length, framework: "v3 raw monthly-chain first" });
  }

  const base = process.env.URL || process.env.DEPLOY_URL;
  if (base) { try { fetch(`${base}/.netlify/functions/scan-build-background?continue=1`, { method: "POST" }); } catch (_) {} }
  return json({ ok: true, status: "running", scanned: state.scanned, pendingIdx: state.pendingIdx, total: state.total, framework: "v3 raw monthly-chain first" });
};
