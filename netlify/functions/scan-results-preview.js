// POPPA'S Option Scanner v4 — preview results endpoint.
// V4 clone only. This endpoint now delegates to the authoritative live scan-results endpoint
// so the preview can no longer drift back to the old monthly 15–45 DTE cached-board logic.

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  }
});

const num = (v, d = null) => {
  if (v === null || v === undefined || v === '') return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

function filterAndSlice(results, q) {
  const limit = Math.min(Math.max(parseInt(q.get('limit') || q.get('maxResults') || '50', 10) || 50, 1), 1000);
  const offset = Math.max(parseInt(q.get('offset') || '0', 10) || 0, 0);
  const rocMin = num(q.get('rocMin'), null);
  const rocMax = num(q.get('rocMax'), null);
  const minProb = num(q.get('minProb'), null);
  const ivMin = num(q.get('ivMin'), null);
  const minOI = num(q.get('minOI'), null);
  const minShortOI = num(q.get('minShortOI'), null);
  const maxSpread = num(q.get('maxSpread'), null);
  const width = num(q.get('width'), null);
  const rankBy = q.get('rankBy') || 'roc';

  let rows = Array.isArray(results) ? results.slice() : [];

  rows = rows.filter(r => {
    const roc = num(r.rocAfterCommissionAndFees ?? r.rocAfterCosts ?? r.roc, -Infinity);
    const lower = num(r.lowerAnchorPOTMPercent, null) ?? (num(r.lowerAnchorPOTM, null) !== null ? num(r.lowerAnchorPOTM) * 100 : num(r.prob, 0));
    const iv = num(r.monthlyChainIV ?? r.iv, 0);
    const oi = num(r.openInterest ?? r.monthlyOI, 0);
    const shortOI = Math.min(num(r.shortPutOI, 0), num(r.shortCallOI, 0));
    const spread = num(r.spreadMax, null);
    const rowWidth = num(r.requestedWidth ?? r.width, null);
    const dte = num(r.dte, -999);

    if (dte < 0 || dte > 45) return false;
    if (rocMin !== null && roc < rocMin) return false;
    if (rocMax !== null && roc > rocMax) return false;
    if (minProb !== null && lower < minProb) return false;
    if (ivMin !== null && iv < ivMin) return false;
    if (minOI !== null && oi < minOI) return false;
    if (minShortOI !== null && shortOI < minShortOI) return false;
    if (maxSpread !== null && spread !== null && spread > maxSpread) return false;
    if (width !== null && width > 0 && rowWidth !== null && Math.abs(rowWidth - width) > 0.01) return false;
    return true;
  });

  rows.sort((a, b) => {
    if (rankBy === 'prob') return num(b.lowerAnchorPOTMPercent, 0) - num(a.lowerAnchorPOTMPercent, 0);
    if (rankBy === 'iv') return num(b.monthlyChainIV ?? b.iv, 0) - num(a.monthlyChainIV ?? a.iv, 0);
    return num(b.rocAfterCommissionAndFees ?? b.rocAfterCosts ?? b.roc, 0) - num(a.rocAfterCommissionAndFees ?? a.rocAfterCosts ?? a.roc, 0);
  });

  const pageRows = rows.slice(offset, offset + limit);
  return { rows, pageRows, limit, offset };
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
      return json({
        ok: false,
        error: true,
        message: liveData.message || `scan-results returned HTTP ${liveResponse.status}`,
        dataMode: 'Live Supabase candidate table unavailable',
        results: [],
        total: 0,
        matched: 0,
        returned: 0,
        filters: {
          dteMin: 0,
          dteMax: 45,
          putProbabilityOtmMin: 0.8,
          callProbabilityOtmMin: 0.8
        }
      });
    }

    const { rows, pageRows, limit, offset } = filterAndSlice(liveData.results || [], q);
    const hasMore = offset + limit < rows.length;

    return json({
      ok: true,
      strategy: liveData.strategy || 'SP500_Tight_Condor_Scan_v4_Supabase_Candidates',
      scanMode: 'Live Supabase candidate table · monthly 0–45 DTE · ≥80% put/call P(OTM)',
      dataSource: liveData.dataSource || 'Supabase scan_candidates populated by Schwab/TOS market-data pipeline',
      dataMode: liveData.dataMode || 'Live Supabase candidate table',
      generatedAt: liveData.generatedAt,
      universeCount: liveData.universeCount,
      scanned: liveData.scanned,
      withCondor: liveData.withCondor,
      passCount: liveData.passCount,
      building: false,
      total: Array.isArray(liveData.results) ? liveData.results.length : 0,
      matched: rows.length,
      returned: pageRows.length,
      offset,
      limit,
      hasRows: pageRows.length > 0,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
      filters: {
        dteMin: 0,
        dteMax: 45,
        minProb: num(q.get('minProb'), 80),
        monthlyOptionsChainOnly: true,
        putProbabilityOtmMin: 0.8,
        callProbabilityOtmMin: 0.8
      },
      previewSlice: true,
      processingMode: 'live-supabase-filter-first-slice-second',
      filterMode: 'v4-live-supabase-0-45-prob80',
      serverFiltersApplied: true,
      serverFiltersRemoved: false,
      userMessage: 'Live Supabase candidates loaded using monthly 0–45 DTE and ≥80% put/call P(OTM) filters.',
      results: pageRows
    });
  } catch (error) {
    return json({
      ok: false,
      error: true,
      message: error && error.message ? error.message : String(error),
      dataMode: 'scan-results-preview failed',
      results: [],
      total: 0,
      matched: 0,
      returned: 0
    });
  }
};
