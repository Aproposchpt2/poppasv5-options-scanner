// POPPA'S Option Scanner — Supabase candidate results endpoint.
// V4 clone only. Reads the Supabase candidate table populated by the Schwab -> Netlify -> Supabase pipeline.
// Approved backend-facing retrieval filters:
// 1. Monthly/raw-chain eligible records only
// 2. 0–45 DTE
// 3. Put P(OTM) >= 80% AND Call P(OTM) >= 80%

const COMMISSION_DOLLARS = 2.40;
const FEES_DOLLARS = 0.04;
const TOTAL_TRADING_COST_DOLLARS = COMMISSION_DOLLARS + FEES_DOLLARS;

const json = (o, status = 200, maxAge = 30) => new Response(JSON.stringify(o), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': `no-store, max-age=${maxAge}`
  }
});

const num = (v, d = null) => {
  if (v === null || v === undefined || v === '') return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const round = (v, p = 4) => Number.isFinite(Number(v)) ? +Number(v).toFixed(p) : null;

function normalizeCandidate(r) {
  const source = r.source_payload || {};
  const rawLegs = source.rawLegs || source.raw_legs || null;
  const requestedWidth = num(r.requested_width ?? r.width);
  const naturalCredit = num(r.natural_credit ?? r.credit);
  const midpointCredit = num(r.midpoint_credit ?? r.mid_credit ?? r.displayed_credit ?? r.credit);
  const displayedCredit = num(r.displayed_credit ?? midpointCredit);
  const grossCreditDollars = num(r.gross_credit_dollars, displayedCredit !== null ? round(displayedCredit * 100, 2) : null);
  const netCreditAfterCosts = num(r.net_credit_after_costs, grossCreditDollars !== null ? round(grossCreditDollars - TOTAL_TRADING_COST_DOLLARS, 2) : null);
  const grossMaxRisk = num(r.gross_max_risk, requestedWidth !== null && grossCreditDollars !== null ? round(requestedWidth * 100 - grossCreditDollars, 2) : null);
  const netMaxRiskAfterCosts = num(r.net_max_risk_after_costs, requestedWidth !== null && netCreditAfterCosts !== null ? round(requestedWidth * 100 - netCreditAfterCosts, 2) : null);
  const grossROC = num(r.gross_roc ?? r.roc, grossCreditDollars !== null && grossMaxRisk > 0 ? round(grossCreditDollars / grossMaxRisk * 100, 2) : null);
  const rocAfterCommissionAndFees = num(r.roc_after_commission_and_fees, netCreditAfterCosts !== null && netMaxRiskAfterCosts > 0 ? round(netCreditAfterCosts / netMaxRiskAfterCosts * 100, 2) : null);
  const anchorPutOTM = num(r.anchor_put_otm ?? r.put_prob_otm);
  const anchorCallOTM = num(r.anchor_call_otm ?? r.call_prob_otm);
  const lowerAnchorPOTM = num(r.lower_anchor_p_otm ?? r.prob_otm, anchorPutOTM !== null && anchorCallOTM !== null ? Math.min(anchorPutOTM, anchorCallOTM) : null);

  return {
    id: r.id,
    scanRunId: r.scan_run_id,
    symbol: r.symbol,
    name: r.name,
    sector: r.sector,
    market: r.market,
    spot: num(r.spot),
    iv: num(r.iv),
    hv: num(r.hv),
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
    exactPutWingFound: r.exact_put_wing_found,
    exactCallWingFound: r.exact_call_wing_found,
    equalWidthConfirmed: r.equal_width_confirmed,
    sameExpirationConfirmed: r.same_expiration_confirmed,
    symbolsPresent: r.contract_symbols_present,
    strikeValidationStatus: r.strike_validation_status || 'PASS',
    strikeValidationReason: r.strike_validation_reason || 'Exact strikes confirmed',
    shortPutContractSymbol: r.short_put_contract_symbol,
    longPutContractSymbol: r.long_put_contract_symbol,
    shortCallContractSymbol: r.short_call_contract_symbol,
    longCallContractSymbol: r.long_call_contract_symbol,
    credit: displayedCredit,
    naturalCredit,
    midpointCredit,
    displayedCredit,
    grossCreditDollars,
    netCreditAfterCosts,
    grossMaxRisk,
    netMaxRiskAfterCosts,
    maxRisk: num(r.max_risk),
    grossROC,
    roc: grossROC,
    rocAfterCommissionAndFees,
    rocAfterCosts: rocAfterCommissionAndFees,
    probOtm: num(r.prob_otm),
    prob: num(r.prob_otm) !== null ? round(num(r.prob_otm) * 100, 1) : null,
    putProbOtm: num(r.put_prob_otm),
    callProbOtm: num(r.call_prob_otm),
    anchorPutOTM,
    anchorCallOTM,
    lowerAnchorPOTM,
    lowerAnchorPOTMPercent: lowerAnchorPOTM !== null ? round(lowerAnchorPOTM * 100, 1) : null,
    anchorPutSource: r.anchor_put_source,
    anchorCallSource: r.anchor_call_source,
    anchorPutMethod: r.anchor_put_method,
    anchorCallMethod: r.anchor_call_method,
    anchorPutFallbackReason: r.anchor_put_fallback_reason,
    anchorCallFallbackReason: r.anchor_call_fallback_reason,
    openInterest: num(r.open_interest),
    monthlyOI: num(r.open_interest),
    shortPutOI: num(r.short_put_oi),
    shortCallOI: num(r.short_call_oi),
    longPutOI: num(r.long_put_oi),
    longCallOI: num(r.long_call_oi),
    spreadMax: num(r.spread_max),
    expectedMove: num(r.expected_move),
    expectedLow: num(r.expected_low),
    expectedHigh: num(r.expected_high),
    expectedMoveStatus: r.expected_move_status,
    passed: r.passed,
    score: num(r.score),
    reviewStatus: r.review_status || r.note || 'Candidate for educational review',
    note: r.note,
    rawChainEligible: r.raw_chain_eligible,
    rawChainRule: r.raw_chain_rule,
    sourcePayload: source,
    rawLegs,
    creditSource: r.credit_source,
    creditMethod: r.credit_method,
    commission: num(r.commission, COMMISSION_DOLLARS),
    fees: num(r.fees, FEES_DOLLARS),
    totalTradingCost: num(r.total_trading_cost, TOTAL_TRADING_COST_DOLLARS),
    calculationVersion: r.calculation_version,
    quoteTimeRaw: r.quote_time,
    updatedAt: r.updated_at,
    dataSource: 'Supabase scan_candidates table populated from Schwab/TOS market data'
  };
}

async function supabaseFetch(path) {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase environment variables');
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json'
    }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase REST ${res.status}: ${text.slice(0, 180)}`);
  }
  return res.json();
}

export default async (req) => {
  try {
    const q = new URL(req.url).searchParams;
    const includeRejected = q.get('includeRejected') === 'true';
    const limit = Math.max(1, Math.min(2000, Number(q.get('limit') || (includeRejected ? 1000 : 500))));

    const select = [
      'id','scan_run_id','symbol','name','sector','market','spot','iv','hv','dte','expiry','earnings','earnings_date','next_earnings',
      'short_put','long_put','short_call','long_call','credit','mid_credit','width','max_risk','roc','prob_otm','put_prob_otm','call_prob_otm','short_delta',
      'open_interest','short_put_oi','short_call_oi','long_put_oi','long_call_oi','spread_max','expected_move','expected_low','expected_high','expected_move_status',
      'passed','score','review_status','note','raw_chain_eligible','raw_chain_rule','source_payload','created_at','updated_at','requested_width','actual_put_width','actual_call_width',
      'exact_put_wing_found','exact_call_wing_found','equal_width_confirmed','same_expiration_confirmed','contract_symbols_present','strike_validation_status','strike_validation_reason',
      'short_put_contract_symbol','long_put_contract_symbol','short_call_contract_symbol','long_call_contract_symbol','natural_credit','midpoint_credit','displayed_credit',
      'commission','fees','total_trading_cost','gross_credit_dollars','net_credit_after_costs','gross_max_risk','net_max_risk_after_costs','gross_roc','roc_after_commission_and_fees',
      'anchor_put_otm','anchor_call_otm','lower_anchor_p_otm','anchor_put_source','anchor_call_source','anchor_put_method','anchor_call_method','anchor_put_fallback_reason','anchor_call_fallback_reason',
      'credit_source','credit_method','calculation_version','quote_time'
    ].join(',');

    const baseFilters = new URLSearchParams();
    baseFilters.set('select', select);
    baseFilters.set('raw_chain_eligible', 'eq.true');
    baseFilters.set('dte', 'gte.0');
    baseFilters.append('dte', 'lte.45');
    baseFilters.set('put_prob_otm', 'gte.0.8');
    baseFilters.set('call_prob_otm', 'gte.0.8');
    if (!includeRejected) baseFilters.set('strike_validation_status', 'eq.PASS');
    baseFilters.set('order', 'roc_after_commission_and_fees.desc.nullslast,score.desc.nullslast,updated_at.desc');
    baseFilters.set('limit', String(limit));

    const rows = await supabaseFetch(`scan_candidates?${baseFilters.toString()}`);
    const results = rows.map(normalizeCandidate);

    return json({
      strategy: 'SP500_Tight_Condor_Scan_v4_Supabase_Candidates',
      scanMode: 'Supabase candidate table · Schwab/TOS source data · approved filters active',
      dataSource: 'Supabase scan_candidates populated by Schwab/TOS market-data pipeline',
      dataMode: 'Live Supabase candidate table',
      generatedAt: results[0]?.updatedAt || new Date().toISOString(),
      universeCount: results.length,
      scanned: results.length,
      withCondor: results.length,
      passCount: results.filter(r => r.strikeValidationStatus === 'PASS').length,
      rejectedInvalidStrikeCount: results.filter(r => r.strikeValidationStatus !== 'PASS').length,
      includeRejected,
      approvedRetrievalFilters: {
        monthlyOptionsChainOnly: true,
        rawChainEligible: true,
        dteMin: 0,
        dteMax: 45,
        putProbabilityOtmMin: 0.8,
        callProbabilityOtmMin: 0.8
      },
      lowerAnchorLabel: 'Lower Anchor P(OTM)',
      lowerAnchorDisclosure: 'The lower of Anchor P(OTM) and Anchor C(OTM); not a guaranteed whole-condor probability.',
      pricingMethod: 'Bid/ask midpoint',
      creditDisclosure: 'Displayed Credit is POPPA calculated from Schwab leg midpoints.',
      commission: COMMISSION_DOLLARS,
      fees: FEES_DOLLARS,
      totalTradingCost: TOTAL_TRADING_COST_DOLLARS,
      exactWidthValidationEnabled: true,
      exportEndpoint: '/.netlify/functions/scan-export',
      returned: results.length,
      results
    }, 200, 0);
  } catch (error) {
    return json({
      error: true,
      message: error.message,
      results: [],
      dataMode: 'Supabase candidate load failed'
    }, 500, 0);
  }
};
