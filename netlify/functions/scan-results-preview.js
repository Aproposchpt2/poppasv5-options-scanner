// POPPA'S Option Scanner v4 — public preview results endpoint.
// Delegates to the live candidate endpoint, enriches every row with Directional Bias
// (Hybrid Price-Action Score), and returns paginated results.
// Directional Bias is an educational price-action classification only.
// It is NOT a trade signal, NOT financial advice, NOT a price forecast.

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

const asNumber = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toPercent = value => {
  const n = asNumber(value);
  if (n === null) return null;
  return Math.abs(n) <= 1 ? Math.round(n * 1000) / 10 : Math.round(n * 10) / 10;
};

const addTableAliases = row => {
  const putRaw = asNumber(row.anchorPutOTM) ?? asNumber(row.putProbOtm) ?? asNumber(row.put_prob_otm);
  const callRaw = asNumber(row.anchorCallOTM) ?? asNumber(row.callProbOtm) ?? asNumber(row.call_prob_otm);
  const lowerRaw = asNumber(row.lowerAnchorPOTM) ?? asNumber(row.probOtm) ?? asNumber(row.prob_otm) ?? (putRaw !== null && callRaw !== null ? Math.min(putRaw, callRaw) : null);

  const putPercent = toPercent(row.anchorPutOTM) ?? toPercent(row.putProbOtm) ?? toPercent(row.put_prob_otm);
  const callPercent = toPercent(row.anchorCallOTM) ?? toPercent(row.callProbOtm) ?? toPercent(row.call_prob_otm);
  const lowerPercent = toPercent(row.lowerAnchorPOTMPercent) ?? toPercent(row.lowerAnchorPOTM) ?? toPercent(row.probOtm) ?? toPercent(row.prob_otm) ?? (putPercent !== null && callPercent !== null ? Math.min(putPercent, callPercent) : null);
  const ivPercent = toPercent(row.monthlyChainIV) ?? toPercent(row.iv) ?? toPercent(row.ivDisplay);

  return {
    ...row,

    // The restored table preview performs display filtering in percentage units.
    // The live endpoint returns probabilities as decimals, so expose percent aliases for the preview only.
    lowerAnchorPOTMRaw: lowerRaw,
    anchorPutOTMRaw: putRaw,
    anchorCallOTMRaw: callRaw,
    lowerAnchorPOTM: lowerPercent ?? row.lowerAnchorPOTM,
    anchorPutOTM: putPercent ?? row.anchorPutOTM,
    anchorCallOTM: callPercent ?? row.anchorCallOTM,
    lowerAnchorPOTMPercent: lowerPercent ?? row.lowerAnchorPOTMPercent,
    prob: lowerPercent ?? row.prob,
    probOtm: lowerPercent ?? row.probOtm,
    putProb: putPercent ?? row.putProb,
    callProb: callPercent ?? row.callProb,
    putProbOtm: putPercent ?? row.putProbOtm,
    callProbOtm: callPercent ?? row.callProbOtm,
    monthlyChainIV: ivPercent ?? row.monthlyChainIV,
    iv: ivPercent ?? row.iv,
    oi: row.openInterest ?? row.monthlyOI ?? row.oi,
    monthlyOI: row.openInterest ?? row.monthlyOI ?? row.oi,
    spread: row.spreadMax ?? row.spread,
    credit: row.displayedCredit ?? row.credit
  };
};

// ── Directional Bias: Hybrid Price-Action Score ──────────────────────────────
// Educational classification only. Not a trade signal, not financial advice,
// not a price forecast. Backend computes for every candidate; no candidate is
// excluded based on bias value. Filtering by bias is frontend-only.

async function fetchCandles(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!resp.ok) return null;
    const data = await resp.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const ts = result.timestamp || [];
    const q  = result.indicators?.quote?.[0] || {};
    const candles = [];
    for (let i = 0; i < ts.length; i++) {
      if (q.close?.[i] != null && q.high?.[i] != null && q.low?.[i] != null) {
        candles.push({
          t: new Date(ts[i] * 1000).toISOString().slice(0, 10),
          h: q.high[i],
          l: q.low[i],
          c: q.close[i]
        });
      }
    }
    return candles;
  } catch {
    return null;
  }
}

// Returns EMA array aligned to closes starting at index (period - 1).
function emaHistory(closes, period) {
  if (closes.length < period) return [];
  const k = 2 / (period + 1);
  let e = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const out = [e];
  for (let i = period; i < closes.length; i++) {
    e = closes[i] * k + e * (1 - k);
    out.push(e);
  }
  return out;
}

function calcBias(symbol, candles) {
  const today = new Date().toISOString().slice(0, 10);
  const insufficient = {
    directionalBias: 'Neutral',
    biasScore: 0,
    biasMethod: 'Hybrid Price-Action Score',
    biasReason: 'Insufficient data',
    biasAsOf: today
  };
  if (!candles || candles.length < 35) return insufficient;

  const n      = candles.length;
  const closes = candles.map(c => c.c);
  const highs  = candles.map(c => c.h);
  const lows   = candles.map(c => c.l);
  const close  = closes[n - 1];
  const asOf   = candles[n - 1].t;

  // Component 1 — Trend Posture (20-EMA, 50-EMA, 20-EMA slope over 5 days)
  const ema20a  = emaHistory(closes, 20);
  const ema50a  = emaHistory(closes, 50);
  const ema20   = ema20a[ema20a.length - 1];
  const ema50   = ema50a.length > 0 ? ema50a[ema50a.length - 1] : null;
  const slope20 = ema20a.length >= 6 ? ema20a[ema20a.length - 1] - ema20a[ema20a.length - 6] : 0;

  let c1 = 0, c1txt = 'trend is mixed or flat';
  if (ema50 !== null && close > ema20 && ema20 > ema50 && slope20 > 0) {
    c1 = 1;  c1txt = 'trend is positive';
  } else if (ema50 !== null && close < ema20 && ema20 < ema50 && slope20 < 0) {
    c1 = -1; c1txt = 'trend is negative';
  }

  // Component 2 — Pivot Structure (confirmed 2-bar pivot highs/lows)
  const pH = [], pL = [];
  for (let i = 2; i < n - 2; i++) {
    if (highs[i] > highs[i-1] && highs[i] > highs[i-2] && highs[i] > highs[i+1] && highs[i] > highs[i+2]) pH.push(highs[i]);
    if (lows[i]  < lows[i-1]  && lows[i]  < lows[i-2]  && lows[i]  < lows[i+1]  && lows[i]  < lows[i+2])  pL.push(lows[i]);
  }

  let c2 = 0, c2txt = 'pivots are mixed or insufficient';
  if (pH.length >= 2 && pL.length >= 2) {
    const bullPivot = pH[pH.length-1] > pH[pH.length-2] && pL[pL.length-1] > pL[pL.length-2];
    const bearPivot = pH[pH.length-1] < pH[pH.length-2] && pL[pL.length-1] < pL[pL.length-2];
    if (bullPivot)      { c2 = 1;  c2txt = 'pivot structure is bullish'; }
    else if (bearPivot) { c2 = -1; c2txt = 'pivot structure is bearish'; }
    else                { c2txt = 'pivot structure is mixed'; }
  }

  // Component 3 — 20-Day Range Location
  const r20H = Math.max(...highs.slice(-20));
  const r20L = Math.min(...lows.slice(-20));
  const rng  = r20H - r20L;
  let c3 = 0, c3txt = 'price is mid-range';
  if (rng > 0) {
    const pos = (close - r20L) / rng;
    if (pos >= 0.60)      { c3 = 1;  c3txt = 'price is in upper range'; }
    else if (pos <= 0.40) { c3 = -1; c3txt = 'price is in lower range'; }
  }

  const score = c1 + c2 + c3;
  const bias  = score >= 2 ? 'Bullish' : score <= -2 ? 'Bearish' : 'Neutral';

  let reason;
  if (score === 3) {
    reason = 'Trend, pivot structure, and range location all confirm upside posture.';
  } else if (score === -3) {
    reason = 'Price below trend averages, lower highs and lower lows, and in lower range.';
  } else {
    const s = c1txt.charAt(0).toUpperCase() + c1txt.slice(1);
    reason = `${s}, ${c2txt}, and ${c3txt}.`;
  }

  return { directionalBias: bias, biasScore: score, biasMethod: 'Hybrid Price-Action Score', biasReason: reason, biasAsOf: asOf };
}

export default async (req) => {
  try {
    const incoming = new URL(req.url);
    const q = incoming.searchParams;
    const liveUrl = new URL('/.netlify/functions/scan-results', incoming.origin);
    liveUrl.searchParams.set('passersTop', 'true');
    liveUrl.searchParams.set('limit', q.get('liveLimit') || '1000');

    const liveResponse = await fetch(liveUrl.toString(), { headers: { Accept: 'application/json' } });
    const liveData = await liveResponse.json().catch(() => ({}));

    if (!liveResponse.ok || liveData.error) {
      return json({ ok: false, error: true, message: 'Candidate results are temporarily unavailable. Please try again.', dataMode: 'Market candidate load unavailable', results: [], total: 0, matched: 0, returned: 0 });
    }

    const allRows = (Array.isArray(liveData.results) ? liveData.results : []).map(addTableAliases);

    // Fetch OHLC for all unique symbols in parallel, then compute Directional Bias.
    // All candidates receive a bias value. None are excluded by bias.
    const symbols = [...new Set(allRows.map(r => r.symbol).filter(Boolean))];
    const candleMap = new Map();
    await Promise.allSettled(symbols.map(async sym => {
      candleMap.set(sym, await fetchCandles(sym));
    }));
    const enriched = allRows.map(r => ({ ...r, ...calcBias(r.symbol, candleMap.get(r.symbol)) }));

    const limit    = Math.min(Math.max(parseInt(q.get('limit') || q.get('maxResults') || '50', 10) || 50, 1), 1000);
    const offset   = Math.max(parseInt(q.get('offset') || '0', 10) || 0, 0);
    const pageRows = enriched.slice(offset, offset + limit);
    const hasMore  = offset + limit < enriched.length;

    return json({
      ok: true,
      strategy: 'POPPA_S_Strategy_OS_Candidate_Scan',
      scanMode: 'Live market candidates · approved strategy filters active',
      dataSource: "Professional market-data feed processed by POPPA'S Strategy OS",
      dataMode: 'Live market candidates',
      generatedAt: liveData.generatedAt,
      universeCount: liveData.universeCount || enriched.length,
      scanned: liveData.scanned || enriched.length,
      withCondor: liveData.withCondor || enriched.length,
      passCount: liveData.passCount || enriched.length,
      building: false,
      total: enriched.length,
      matched: enriched.length,
      returned: pageRows.length,
      offset,
      limit,
      hasRows: pageRows.length > 0,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
      filters: { dteMin: 0, dteMax: 45, minAnchorProbability: 80 },
      previewSlice: true,
      processingMode: 'live-market-candidate-pool-first-slice-second-percent-normalized',
      filterMode: 'approved-strategy-filters',
      serverFiltersApplied: true,
      serverFiltersRemoved: false,
      userMessage: 'Live market candidates loaded using approved strategy filters.',
      results: pageRows
    });
  } catch (error) {
    return json({ ok: false, error: true, message: 'Candidate results are temporarily unavailable. Please try again.', dataMode: 'Market candidate load unavailable', results: [], total: 0, matched: 0, returned: 0 });
  }
};
