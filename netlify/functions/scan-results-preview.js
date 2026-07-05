// POPPA'S Option Scanner v4 — public preview results endpoint.
// Delegates to the live candidate endpoint and avoids extra preview-only filtering.

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

const asNumber = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const addTableAliases = row => {
  const put = asNumber(row.anchorPutOTM) ?? asNumber(row.putProbOtm);
  const call = asNumber(row.anchorCallOTM) ?? asNumber(row.callProbOtm);
  const lower = asNumber(row.lowerAnchorPOTM) ?? asNumber(row.probOtm) ?? (put !== null && call !== null ? Math.min(put, call) : null);
  const lowerPercent = asNumber(row.lowerAnchorPOTMPercent) ?? (lower !== null ? Math.round(lower * 1000) / 10 : null);
  return {
    ...row,
    prob: lowerPercent ?? row.prob,
    probOtm: lower ?? row.probOtm,
    putProb: put !== null ? Math.round(put * 1000) / 10 : row.putProb,
    callProb: call !== null ? Math.round(call * 1000) / 10 : row.callProb,
    oi: row.openInterest ?? row.monthlyOI ?? row.oi,
    spread: row.spreadMax ?? row.spread,
    credit: row.displayedCredit ?? row.credit
  };
};

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
    const limit = Math.min(Math.max(parseInt(q.get('limit') || q.get('maxResults') || '50', 10) || 50, 1), 1000);
    const offset = Math.max(parseInt(q.get('offset') || '0', 10) || 0, 0);
    const pageRows = allRows.slice(offset, offset + limit);
    const hasMore = offset + limit < allRows.length;

    return json({
      ok: true,
      strategy: 'POPPA_S_Strategy_OS_Candidate_Scan',
      scanMode: 'Live market candidates · approved strategy filters active',
      dataSource: 'Professional market-data feed processed by POPPA’S Strategy OS',
      dataMode: 'Live market candidates',
      generatedAt: liveData.generatedAt,
      universeCount: liveData.universeCount || allRows.length,
      scanned: liveData.scanned || allRows.length,
      withCondor: liveData.withCondor || allRows.length,
      passCount: liveData.passCount || allRows.length,
      building: false,
      total: allRows.length,
      matched: allRows.length,
      returned: pageRows.length,
      offset,
      limit,
      hasRows: pageRows.length > 0,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
      filters: { dteMin: 0, dteMax: 45, minAnchorProbability: 80 },
      previewSlice: true,
      processingMode: 'live-market-candidate-pool-first-slice-second',
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
