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
