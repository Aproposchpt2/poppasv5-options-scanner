// POPPA'S Option Scanner — Supabase candidate results endpoint.
// V4 clone only. Reads public.scan_candidates populated by the Schwab -> Netlify -> Supabase pipeline.
// Approved retrieval filters: raw_chain_eligible=true, 0-45 DTE, put_prob_otm>=0.8, call_prob_otm>=0.8.

const COMMISSION_DOLLARS = 2.40;
const FEES_DOLLARS = 0.04;
const TOTAL_TRADING_COST_DOLLARS = COMMISSION_DOLLARS + FEES_DOLLARS;

const json = (o, status = 200) => new Response(JSON.stringify(o), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});

const envGet = name => {
  try {
    if (globalThis.Netlify && Netlify.env && typeof Netlify.env.get === 'function') {
      const v = Netlify.env.get(name);
      if (v) return v;
    }
  } catch (_) {}
  return process.env[name];
};

const num = (v, d = null) => {
  if (v === null || v === undefined || v === '') return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const round = (v, p = 4) => Number.isFinite(Number(v)) ? +Number(v).toFixed(p) : null;

function mapRow(r) {
  const requestedWidth = num(r.requested_width ?? r.width);
  const displayedCredit = num(r.displayed_credit ?? r.midpoint_credit ?? r.mid_credit ?? r.credit);
  const grossCreditDollars = displayedCredit !== null ? round(displayedCredit * 100, 2) : null;
  const netCreditAfterCosts = grossCreditDollars !== null ? round(grossCreditDollars - TOTAL_TRADING_COST_DOLLARS, 2) : null;
  const grossMaxRisk = requestedWidth !== null && grossCreditDollars !== null ? round(requestedWidth * 100 - grossCreditDollars, 2) : null;
  const netMaxRiskAfterCosts = requestedWidth !== null && netCreditAfterCosts !== null ? round(requestedWidth * 100 - netCreditAfterCosts, 2) : null;
  const grossROC = num(r.gross_roc ?? r.roc, grossCreditDollars !== null && grossMaxRisk > 0 ? round(grossCreditDollars / grossMaxRisk * 100, 2) : null);
  const rocAfterCommissionAndFees = num(r.roc_after_commission_and_fees, netCreditAfterCosts !== null && netMaxRiskAfterCosts > 0 ? round(netCreditAfterCosts / netMaxRiskAfterCosts * 100, 2) : null);
  const anchorPutOTM = num(r.anchor_put_otm ?? r.put_prob_otm);
  const anchorCallOTM = num(r.anchor_call_otm ?? r.call_prob_otm);
  const lowerAnchorPOTM = num(r.lower_anchor_p_otm ?? r.prob_otm, anchorPutOTM !== null && anchorCallOTM !== null ? Math.min(anchorPutOTM, anchorCallOTM) : null);

  return {
    id: r.id,
    symbol: r.symbol,
    sector: r.sector,
    market: r.market,
    spot: num(r.spot),
    iv: num(r.iv),
    dte: num(r.dte),
    expiry: r.expiry,
    earnings: r.earnings,
    earningsDate: r.earnings_date,
    nextEarnings: r.next_earnings,
    shortPut: num(r.short_put),
    longPut: num(r.long_put),
    shortCall: num(r.short_call),
    longCall: num(r.long_call),
    requestedWidth,
    width: requestedWidth,
    actualPutWidth: num(r.actual_put_width),
    actualCallWidth: num(r.actual_call_width),
    strikeValidationStatus: r.strike_validation_status || 'PASS',
    strikeValidationReason: r.strike_validation_reason || 'Exact strikes confirmed',
    naturalCredit: num(r.natural_credit ?? r.credit),
    midpointCredit: num(r.midpoint_credit ?? r.mid_credit ?? r.credit),
    displayedCredit,
    credit: displayedCredit,
    grossROC,
    roc: grossROC,
    rocAfterCommissionAndFees,
    rocAfterCosts: rocAfterCommissionAndFees,
    anchorPutOTM,
    anchorCallOTM,
    lowerAnchorPOTM,
    lowerAnchorPOTMPercent: lowerAnchorPOTM !== null ? round(lowerAnchorPOTM * 100, 1) : null,
    putProbOtm: num(r.put_prob_otm),
    callProbOtm: num(r.call_prob_otm),
    probOtm: num(r.prob_otm),
    prob: num(r.prob_otm) !== null ? round(num(r.prob_otm) * 100, 1) : null,
    openInterest: num(r.open_interest),
    monthlyOI: num(r.open_interest),
    shortPutOI: num(r.short_put_oi),
    shortCallOI: num(r.short_call_oi),
    spreadMax: num(r.spread_max),
    expectedMove: num(r.expected_move),
    expectedMoveStatus: r.expected_move_status || 'Verify',
    passed: r.passed,
    score: num(r.score),
    reviewStatus: r.review_status || r.note || 'Candidate for educational review',
    note: r.note,
    rawChainEligible: r.raw_chain_eligible,
    rawChainRule: r.raw_chain_rule,
    updatedAt: r.updated_at,
    commission: COMMISSION_DOLLARS,
    fees: FEES_DOLLARS,
    totalTradingCost: TOTAL_TRADING_COST_DOLLARS,
    dataSource: 'Supabase scan_candidates table populated from Schwab/TOS market data'
  };
}

async function supabaseRows(path) {
  const rawUrl = envGet('SUPABASE_URL') || '';
  const url = rawUrl.replace(/\/$/, '');
  const key = envGet('SUPABASE_SERVICE_ROLE_KEY') || envGet('SUPABASE_SERVICE_KEY') || envGet('SUPABASE_ANON_KEY');
  if (!url || !key) {
    throw new Error(`Missing Supabase env. SUPABASE_URL=${url ? 'present' : 'missing'} SERVICE_ROLE=${envGet('SUPABASE_SERVICE_ROLE_KEY') ? 'present' : 'missing'} ANON=${envGet('SUPABASE_ANON_KEY') ? 'present' : 'missing'}`);
  }
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' }
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Supabase REST ${response.status}: ${text.slice(0, 900)}`);
  }
  return response.json();
}

export default async (req) => {
  try {
    const q = new URL(req.url).searchParams;
    const includeRejected = q.get('includeRejected') === 'true';
    const limit = Math.max(1, Math.min(1000, Number(q.get('limit') || 500)));

    const select = [
      'id','symbol','sector','market','spot','iv','dte','expiry','earnings','earnings_date','next_earnings',
      'short_put','long_put','short_call','long_call','credit','mid_credit','width','roc','prob_otm','put_prob_otm','call_prob_otm',
      'open_interest','short_put_oi','short_call_oi','spread_max','expected_move','expected_move_status','passed','score','review_status','note',
      'raw_chain_eligible','raw_chain_rule','updated_at','requested_width','actual_put_width','actual_call_width','strike_validation_status','strike_validation_reason',
      'natural_credit','midpoint_credit','displayed_credit','gross_roc','roc_after_commission_and_fees','anchor_put_otm','anchor_call_otm','lower_anchor_p_otm'
    ].join(',');

    const params = new URLSearchParams();
    params.set('select', select);
    params.set('raw_chain_eligible', 'eq.true');
    params.set('dte', 'gte.0');
    params.append('dte', 'lte.45');
    params.set('put_prob_otm', 'gte.0.8');
    params.set('call_prob_otm', 'gte.0.8');
    if (!includeRejected) params.set('strike_validation_status', 'eq.PASS');
    params.set('order', 'roc_after_commission_and_fees.desc.nullslast,score.desc.nullslast,updated_at.desc');
    params.set('limit', String(limit));

    const rows = await supabaseRows(`scan_candidates?${params.toString()}`);
    const results = rows.map(mapRow);

    return json({
      strategy: 'SP500_Tight_Condor_Scan_v4_Supabase_Candidates',
      scanMode: 'Supabase candidate table · approved filters active',
      dataSource: 'Supabase scan_candidates populated by Schwab/TOS market-data pipeline',
      dataMode: 'Live Supabase candidate table',
      generatedAt: results[0]?.updatedAt || new Date().toISOString(),
      universeCount: results.length,
      scanned: results.length,
      withCondor: results.length,
      passCount: results.filter(r => r.strikeValidationStatus === 'PASS').length,
      includeRejected,
      approvedRetrievalFilters: { monthlyOptionsChainOnly: true, rawChainEligible: true, dteMin: 0, dteMax: 45, putProbabilityOtmMin: 0.8, callProbabilityOtmMin: 0.8 },
      lowerAnchorLabel: 'Lower Anchor P(OTM)',
      pricingMethod: 'Bid/ask midpoint',
      commission: COMMISSION_DOLLARS,
      fees: FEES_DOLLARS,
      totalTradingCost: TOTAL_TRADING_COST_DOLLARS,
      returned: results.length,
      results
    });
  } catch (error) {
    console.error('[scan-results] Supabase candidate load failed:', error && error.message ? error.message : error);
    return json({
      error: true,
      message: error && error.message ? error.message : String(error),
      results: [],
      dataMode: 'Supabase candidate load failed'
    }, 200);
  }
};
