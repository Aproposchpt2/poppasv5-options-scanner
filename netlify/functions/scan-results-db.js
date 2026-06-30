// POPPA'S Option Scanner v3 — Supabase results endpoint.
// Applies user Band Intake values server-side, then paginates.

import { createClient } from "@supabase/supabase-js";

const DEFAULT_STRATEGY = "SP500_Tight_Condor_Scan_v3_RawMonthlyFirst";
const DEFAULT_SCAN_MODE = "Live · Monthly 15-45 DTE raw-chain-first · CBOE EOD (delayed) · Supabase persistence";
const DEFAULT_DATA_SOURCE = "CBOE free delayed/EOD quotes; Band Intake values are applied in the Supabase read endpoint";

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

function supabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

const num = (v, d) => {
  if (v === null || v === undefined || v === "") return d;
  const n = +v;
  return Number.isFinite(n) ? n : d;
};
const clean = v => String(v || "").trim();

function getFilters(q) {
  return {
    rocMin: num(q.get("rocMin"), 5),
    rocMax: num(q.get("rocMax"), 10),
    minProb: num(q.get("minProb"), 90),
    ivMin: num(q.get("ivMin"), 30),
    minOI: num(q.get("minOI"), 10000),
    minShortOI: num(q.get("minShortOI"), 1),
    maxSpread: num(q.get("maxSpread"), 0.25),
    dteMin: num(q.get("dteMin"), 15),
    dteMax: num(q.get("dteMax"), 45),
    excludeEarnings: (q.get("excludeEarnings") || "yes") !== "no",
    idx: clean(q.get("idx") || "both").toLowerCase(),
    width: num(q.get("width"), 5),
    emStatus: clean(q.get("emStatus") || q.get("expectedMoveStatus") || "Outside Expected Move"),
    ivStatus: clean(q.get("ivStatus") || "All"),
    rankBy: clean(q.get("rankBy") || "edge").toLowerCase()
  };
}

function probFloor(v) {
  const n = num(v, 90);
  return n > 1 ? n / 100 : n;
}

async function latestRun(sb) {
  const { data: active, error: activeError } = await sb.from("scan_runs")
    .select("*")
    .in("status", ["running", "stale"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeError) throw activeError;
  if (active) return active;

  const { data, error } = await sb.from("scan_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

function applyFilters(query, f) {
  let q = query
    .gte("roc", f.rocMin)
    .lte("roc", f.rocMax)
    .gte("prob_otm", probFloor(f.minProb))
    .gte("iv", f.ivMin)
    .gte("open_interest", f.minOI)
    .gte("short_put_oi", f.minShortOI)
    .gte("short_call_oi", f.minShortOI)
    .gte("dte", f.dteMin)
    .lte("dte", f.dteMax);

  if (Number.isFinite(+f.maxSpread)) q = q.lte("spread_max", f.maxSpread);
  if (f.excludeEarnings) q = q.eq("earnings", false);
  if (["sp", "ndx"].includes(f.idx)) q = q.or(`market.eq.both,market.eq.${f.idx}`);
  if (f.width && Number(f.width) > 0) {
    const w = Number(f.width);
    q = q.gte("width", +(w - 0.01).toFixed(2)).lte("width", +(w + 0.01).toFixed(2));
  }

  const em = f.emStatus.toLowerCase();
  if (em && !["all", "both", "any"].includes(em)) {
    if (em.includes("outside")) q = q.in("expected_move_status", ["Outside EM", "Outside Expected Move"]);
    else if (em.includes("near")) q = q.in("expected_move_status", ["Near EM", "Near Expected Move"]);
    else if (em.includes("inside")) q = q.in("expected_move_status", ["Inside EM", "Inside Expected Move"]);
    else if (em.includes("verify")) q = q.eq("expected_move_status", "Verify");
  }

  const ivs = f.ivStatus.toLowerCase();
  if (ivs && !["all", "both", "any"].includes(ivs)) {
    if (ivs.includes("inflated")) q = q.gte("iv", 40);
    else if (ivs.includes("deflated")) q = q.lt("iv", 30);
    else if (ivs.includes("fair")) q = q.gte("iv", 30).lt("iv", 40);
  }

  return q;
}

function applyOrdering(q, rankBy) {
  if (rankBy.includes("roc")) return q.order("roc", { ascending: false, nullsFirst: false }).order("score", { ascending: false, nullsFirst: false });
  if (rankBy.includes("prob")) return q.order("prob_otm", { ascending: false, nullsFirst: false }).order("score", { ascending: false, nullsFirst: false });
  if (rankBy.includes("iv")) return q.order("iv", { ascending: false, nullsFirst: false }).order("score", { ascending: false, nullsFirst: false });
  if (rankBy.includes("credit")) return q.order("credit", { ascending: false, nullsFirst: false }).order("score", { ascending: false, nullsFirst: false });
  return q.order("score", { ascending: false, nullsFirst: false }).order("roc", { ascending: false, nullsFirst: false }).order("credit", { ascending: false, nullsFirst: false });
}

function ivStatusFor(iv) {
  const n = Number(iv || 0);
  if (!Number.isFinite(n) || n <= 0) return "Fair";
  if (n >= 40) return "Inflated";
  if (n < 30) return "Deflated";
  return "Fair";
}

function rowOut(r) {
  const prob = Number(r.prob_otm || 0) * 100;
  return {
    id: r.id,
    symbol: r.symbol,
    name: r.name,
    sector: r.sector,
    market: r.market,
    spot: r.spot == null ? null : Number(r.spot),
    iv: r.iv == null ? null : Number(r.iv),
    hv: r.hv == null ? null : Number(r.hv),
    monthlyChainIV: r.iv == null ? null : Number(r.iv),
    ivStatus: ivStatusFor(r.iv),
    dte: r.dte,
    expiry: r.expiry,
    earnings: !!r.earnings,
    earningsDate: r.earnings_date,
    nextEarnings: r.next_earnings,
    shortPut: r.short_put == null ? null : Number(r.short_put),
    longPut: r.long_put == null ? null : Number(r.long_put),
    shortCall: r.short_call == null ? null : Number(r.short_call),
    longCall: r.long_call == null ? null : Number(r.long_call),
    credit: r.credit == null ? null : Number(r.credit),
    midCredit: r.mid_credit == null ? null : Number(r.mid_credit),
    width: r.width == null ? null : Number(r.width),
    risk: r.max_risk == null ? null : Number(r.max_risk),
    maxRisk: r.max_risk == null ? null : Number(r.max_risk),
    roc: r.roc == null ? null : Number(r.roc),
    prob: Number.isFinite(prob) ? Math.round(prob) : null,
    probOtm: r.prob_otm == null ? null : Number(r.prob_otm),
    putProbOtm: r.put_prob_otm == null ? null : Number(r.put_prob_otm),
    callProbOtm: r.call_prob_otm == null ? null : Number(r.call_prob_otm),
    shortDelta: r.short_delta == null ? null : Number(r.short_delta),
    openInterest: r.open_interest || 0,
    shortPutOI: r.short_put_oi || 0,
    shortCallOI: r.short_call_oi || 0,
    longPutOI: r.long_put_oi || 0,
    longCallOI: r.long_call_oi || 0,
    spreadMax: r.spread_max == null ? null : Number(r.spread_max),
    expectedMove: r.expected_move == null ? null : Number(r.expected_move),
    expectedLow: r.expected_low == null ? null : Number(r.expected_low),
    expectedHigh: r.expected_high == null ? null : Number(r.expected_high),
    expectedMoveStatus: r.expected_move_status || "Verify",
    passed: true,
    score: r.score || 0,
    reviewStatus: "Matches current Band Intake values ✓",
    note: r.note || "Band-matched candidate. Verify live chain data before use.",
    rawChainEligible: !!r.raw_chain_eligible,
    rawChainRule: r.raw_chain_rule
  };
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const q = url.searchParams;
    const limit = Math.min(Math.max(parseInt(q.get("limit") || "50", 10) || 50, 1), 250);
    const offset = Math.max(parseInt(q.get("offset") || "0", 10) || 0, 0);
    const filters = getFilters(q);
    const sb = supabase();
    const run = await latestRun(sb);

    if (!run) {
      return json({
        ok: true,
        noScan: true,
        strategy: DEFAULT_STRATEGY,
        scanMode: DEFAULT_SCAN_MODE,
        dataSource: DEFAULT_DATA_SOURCE,
        generatedAt: null,
        scanRunId: null,
        status: "empty",
        building: false,
        progress: { scanned: 0, total: 0 },
        universeCount: 0,
        scanned: 0,
        total: 0,
        matched: 0,
        returned: 0,
        offset,
        limit,
        hasMore: false,
        nextOffset: null,
        filterMode: "supabase-band-aware-page",
        processingMode: "supabase-filter-page",
        serverFiltersApplied: true,
        filters,
        results: [],
        userMessage: "No Supabase scan run exists yet. Start a scan."
      });
    }

    let query = sb.from("scan_candidates").select("*", { count: "exact" }).eq("scan_run_id", run.id);
    query = applyFilters(query, filters);
    query = applyOrdering(query, filters.rankBy).range(offset, offset + limit - 1);
    const { data, error, count } = await query;
    if (error) throw error;

    const matched = count || 0;
    const rows = (data || []).map(rowOut);
    const hasMore = offset + limit < matched;
    const building = ["running", "stale"].includes(run.status);

    return json({
      ok: true,
      strategy: run.strategy || DEFAULT_STRATEGY,
      scanMode: run.scan_mode || DEFAULT_SCAN_MODE,
      dataSource: run.data_source || DEFAULT_DATA_SOURCE,
      generatedAt: run.updated_at || run.started_at,
      scanRunId: run.id,
      status: run.status,
      building,
      progress: { scanned: run.scanned_count || 0, total: run.universe_count || 0 },
      universeCount: run.universe_count || 0,
      scanned: run.scanned_count || 0,
      total: run.candidate_count || matched,
      withCondor: run.candidate_count || matched,
      passCount: matched,
      matched,
      returned: rows.length,
      offset,
      limit,
      hasRows: rows.length > 0,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
      filterMode: "supabase-band-aware-page",
      processingMode: "supabase-filter-page",
      serverFiltersApplied: true,
      backendFiltersRemoved: true,
      filters,
      results: rows,
      userMessage: building
        ? "Supabase scan is still building. Displaying rows that match current Band Intake values."
        : "Supabase scan is ready. Displaying rows that match current Band Intake values."
    });
  } catch (err) {
    return json({ ok: false, error: String(err?.message || err) }, 500);
  }
};
