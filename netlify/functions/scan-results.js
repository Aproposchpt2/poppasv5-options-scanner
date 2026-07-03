// POPPA'S Option Scanner — unfiltered cached-board results endpoint.
// Schwab parity rule: preserve raw Schwab values and label every displayed/calculated field.

import { getStore } from "@netlify/blobs";

const num = (v, d) => {
  if (v === null || v === undefined || v === "") return d;
  const n = +v;
  return Number.isFinite(n) ? n : d;
};

const json = (o, maxAge) => new Response(JSON.stringify(o), {
  status: 200,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=" + (maxAge || 600)
  }
});

const hasValue = v => v !== null && v !== undefined && Number.isFinite(+v);
const round = (v, places = 2) => Number.isFinite(+v) ? +(+v).toFixed(places) : null;
const rocOf = r => (r.roc != null ? r.roc : (r.credit && r.width && r.width - r.credit > 0 ? r.credit / (r.width - r.credit) * 100 : 0));
const probOf = r => (r.prob != null ? r.prob : Math.round((r.probOtm || 0) * 100));
const chainIVOf = r => num(r.monthlyChainIVDisplay ?? r.monthlyChainIV ?? r.chainIV ?? r.iv, 0);
const shortPutOI = r => num(r.shortPutOI ?? r.putShortOI ?? r.oiMin, null);
const shortCallOI = r => num(r.shortCallOI ?? r.callShortOI ?? r.oiMin, null);
const longPutOI = r => num(r.longPutOI, null);
const longCallOI = r => num(r.longCallOI, null);
const spreadOf = r => hasValue(r.spreadMax) ? +r.spreadMax : (hasValue(r.spread) ? +r.spread : null);

function lineage(rawValue, displayValue, source, method, asOf = null, fallbackReason = null) {
  return { rawValue, displayValue, source, method, asOf, fallbackReason };
}

const expectedMoveFor = r => {
  const spot = num(r.spotDisplay ?? r.spot, null), iv = chainIVOf(r), dte = num(r.dte, null);
  if (!hasValue(spot) || !hasValue(iv) || !hasValue(dte) || spot <= 0 || iv <= 0 || dte <= 0) {
    return {
      expectedMove: r.expectedMoveDisplay ?? r.expectedMove ?? null,
      expectedLow: r.expectedLow ?? null,
      expectedHigh: r.expectedHigh ?? null,
      expectedMoveStatus: r.expectedMoveStatus || "Verify",
      source: r.expectedMoveSource || "Missing",
      method: r.expectedMoveMethod || "No valid expected-move input available",
      fallbackReason: r.expectedMoveFallbackReason || "Missing spot, IV, or DTE"
    };
  }

  const alreadyHasMove = hasValue(r.expectedMoveDisplay ?? r.expectedMove);
  const move = alreadyHasMove ? +(r.expectedMoveDisplay ?? r.expectedMove) : +(spot * (iv / 100) * Math.sqrt(dte / 365)).toFixed(2);
  const low = hasValue(r.expectedLow) ? +r.expectedLow : +(spot - move).toFixed(2);
  const high = hasValue(r.expectedHigh) ? +r.expectedHigh : +(spot + move).toFixed(2);
  let status = r.expectedMoveStatus || "Review";
  const put = num(r.shortPut, null), call = num(r.shortCall, null);

  if (hasValue(put) && hasValue(call)) {
    const buffer = Math.max(move * 0.10, spot * 0.005);
    if (put < low && call > high) status = "Outside EM";
    else if (put >= low + buffer || call <= high - buffer) status = "Inside EM";
    else status = "Near EM";
  }

  return {
    expectedMove: move,
    expectedLow: low,
    expectedHigh: high,
    expectedMoveStatus: status,
    source: r.expectedMoveSource || (alreadyHasMove ? "Schwab raw" : "POPPA calculated"),
    method: r.expectedMoveMethod || (alreadyHasMove ? "Schwab/TOS API-provided expected move" : "Underlying Price × IV × sqrt(DTE / 365)"),
    fallbackReason: r.expectedMoveFallbackReason || (alreadyHasMove ? null : "Schwab expected move unavailable")
  };
};

function normalizedRow(r) {
  const monthlyChainIV = chainIVOf(r);
  const em = expectedMoveFor(r);
  const roc = round(rocOf(r), 2) ?? 0;
  const prob = probOf(r);
  const displayIV = Number.isFinite(monthlyChainIV) ? +monthlyChainIV.toFixed(1) : 0;
  const reviewStatus = r.reviewStatus || (r.passed ? "Matches primary filters ✓" : (r.note || "Candidate for manual review"));
  const sourceLabels = {
    ...(r.sourceLabels || {}),
    dataSource: r.dataSource || "Schwab/TOS Market Data API",
    spot: r.spotSource || "Schwab raw",
    bid: "Schwab raw",
    ask: "Schwab raw",
    mark: r.markSource || "Schwab raw",
    mid: r.midSource || "POPPA calculated",
    openInterest: r.openInterestSource || "Schwab raw",
    volume: r.volumeSource || "Schwab raw",
    greeks: r.greeksSource || "Schwab raw",
    monthlyChainIV: r.monthlyChainIVSource || "Schwab raw",
    probabilityOTM: r.probabilitySource || "Schwab raw or POPPA calculated fallback",
    expectedMove: em.source,
    roc: "POPPA calculated",
    netCredit: r.netCreditSource || "POPPA calculated from Schwab leg bid/ask",
    maxRisk: "POPPA calculated",
    spreadWidth: "POPPA calculated",
    reviewStatus: "POPPA calculated"
  };

  const fieldLineage = {
    ...(r.fieldLineage || {}),
    spot: r.fieldLineage?.spot || lineage(r.spotRaw ?? r.spot, r.spotDisplay ?? r.spot, sourceLabels.spot, "Schwab underlying price", r.quoteTimeRaw ?? r.asOf ?? null),
    monthlyChainIV: r.fieldLineage?.monthlyChainIV || lineage(r.monthlyChainIVRaw ?? r.ivRaw ?? r.iv, displayIV, sourceLabels.monthlyChainIV, r.monthlyChainIVMethod || "Schwab/TOS chain volatility or documented fallback", r.quoteTimeRaw ?? r.asOf ?? null, r.monthlyChainIVFallbackReason || null),
    probabilityOTM: r.fieldLineage?.probabilityOTM || lineage(r.probabilityOTMRaw ?? r.probOtm, prob, sourceLabels.probabilityOTM, r.probabilityMethod || "Schwab/TOS P(OTM) if present; otherwise delta approximation", r.quoteTimeRaw ?? r.asOf ?? null, r.probabilityFallbackReason || null),
    expectedMove: r.fieldLineage?.expectedMove || lineage(r.expectedMoveRaw ?? r.expectedMove, em.expectedMove, em.source, em.method, r.quoteTimeRaw ?? r.asOf ?? null, em.fallbackReason),
    roc: r.fieldLineage?.roc || lineage(null, roc, "POPPA calculated", "Net Credit / Max Risk × 100", r.generatedAt ?? null),
    reviewStatus: r.fieldLineage?.reviewStatus || lineage(null, reviewStatus, "POPPA calculated", "Scanner review criteria; educational only", r.generatedAt ?? null)
  };

  return {
    ...r,
    dataSource: r.dataSource || "Schwab/TOS Market Data API",
    rawSourcePreserved: r.rawSourcePreserved ?? true,
    sourceAuditEnabled: true,
    ivRaw: r.ivRaw ?? r.monthlyChainIVRaw ?? r.iv,
    ivDisplay: displayIV,
    iv: displayIV,
    monthlyChainIVRaw: r.monthlyChainIVRaw ?? r.ivRaw ?? r.monthlyChainIV ?? r.iv,
    monthlyChainIVDisplay: displayIV,
    monthlyChainIV: displayIV,
    monthlyChainIVSource: sourceLabels.monthlyChainIV,
    monthlyChainIVMethod: r.monthlyChainIVMethod || fieldLineage.monthlyChainIV.method,
    monthlyChainIVFallbackReason: r.monthlyChainIVFallbackReason || null,
    roc,
    rocSource: "POPPA calculated",
    rocMethod: "Net Credit / Max Risk × 100",
    prob,
    probabilitySource: sourceLabels.probabilityOTM,
    probabilityMethod: r.probabilityMethod || fieldLineage.probabilityOTM.method,
    probabilityFallbackReason: r.probabilityFallbackReason || null,
    shortPutOI: shortPutOI(r),
    shortCallOI: shortCallOI(r),
    longPutOI: longPutOI(r),
    longCallOI: longCallOI(r),
    spreadMax: spreadOf(r),
    expectedMoveRaw: r.expectedMoveRaw ?? r.expectedMove,
    expectedMove: em.expectedMove,
    expectedMoveDisplay: em.expectedMove,
    expectedLow: em.expectedLow,
    expectedHigh: em.expectedHigh,
    expectedMoveStatus: em.expectedMoveStatus,
    expectedMoveSource: em.source,
    expectedMoveMethod: em.method,
    expectedMoveFallbackReason: em.fallbackReason,
    reviewStatus,
    reviewStatusSource: "POPPA calculated",
    reviewStatusMethod: "Scanner review criteria; educational review classification only; not a trade recommendation.",
    sourceLabels,
    fieldLineage
  };
}

function sortRows(rows, rankBy, passersTop) {
  return rows.sort((a, b) => {
    if (passersTop && (b.passed ? 1 : 0) - (a.passed ? 1 : 0)) return (b.passed ? 1 : 0) - (a.passed ? 1 : 0);
    if (rankBy === "roc") return rocOf(b) - rocOf(a);
    return (b.edge || b.score || 0) - (a.edge || a.score || 0) || rocOf(b) - rocOf(a);
  });
}

export default async (req) => {
  const store = getStore("poppas-scan");
  let board = null;
  try { board = await store.get("latest", { type: "json" }); } catch (_) {}

  if (!board || !Array.isArray(board.results)) {
    try {
      const base = process.env.URL || process.env.DEPLOY_URL;
      if (base) fetch(`${base}/.netlify/functions/scan-build-background`, { method: "POST" });
    } catch (_) {}

    return json({
      building: true,
      filterMode: "unfiltered-board",
      serverFiltersRemoved: true,
      scanMode: "Building Schwab/TOS market-data scan…",
      dataSource: "Schwab/TOS Market Data API",
      rawSourcePreserved: true,
      sourceAuditEnabled: true,
      earningsShield: "verify before trade",
      probabilityDisclosure: "Anchor-leg probability only; not guaranteed whole-condor probability.",
      userMessage: "Scanner board is not available yet. A Schwab/TOS market-data build was requested.",
      results: []
    }, 30);
  }

  if (board.building) {
    const stale = Date.now() - new Date(board.generatedAt || 0).getTime() > 3 * 60 * 1000;
    if (stale) {
      try {
        const base = process.env.URL || process.env.DEPLOY_URL;
        if (base) fetch(`${base}/.netlify/functions/scan-build-background?continue=1`, { method: "POST" });
      } catch (_) {}
    }
  }

  const q = (() => { try { return new URL(req.url).searchParams; } catch (_) { return new URLSearchParams(); } })();
  const rankBy = q.get("rankBy") || "edge";
  const passersTop = q.get("passersTop") === "yes" || q.get("passersTop") === "true";

  const rows = sortRows(board.results.map(normalizedRow), rankBy, passersTop);
  const dataSource = board.dataSource || "Schwab/TOS Market Data API";
  const isLegacy = /cboe/i.test(dataSource) || /cboe/i.test(board.scanMode || "");

  return json({
    strategy: board.strategy || "SP500_Tight_Condor_Scan_v3_Schwab_Lineage",
    scanMode: board.scanMode || "Schwab/TOS market-data EOD snapshot · source audit enabled",
    dataSource,
    dataMode: board.dataMode || "Schwab market-data EOD snapshot",
    dataSourceWarning: isLegacy ? "Legacy fallback / CBOE delayed, not Schwab" : null,
    rawSourcePreserved: board.rawSourcePreserved ?? true,
    normalizationApplied: board.normalizationApplied ?? true,
    calculationApplied: board.calculationApplied ?? true,
    sourceAuditEnabled: board.sourceAuditEnabled ?? true,
    generatedAt: board.generatedAt,
    universeCount: board.universeCount,
    scanned: board.scanned,
    withCondor: board.withCondor ?? rows.length,
    passCount: board.passCount,
    earningsShield: board.earningsShield || "verify before trade",
    earningsFlagged: board.earningsFlagged,
    probabilityDisclosure: "Anchor-leg probability only; not guaranteed whole-condor probability. Source/method labels identify Schwab raw vs POPPA calculated values.",
    monthlyChainIVDisclosure: board.monthlyChainIVDisclosure || "Monthly Chain IV is Schwab raw when provided; otherwise it is explicitly labeled as a fallback calculation.",
    expectedMoveDisclosure: board.expectedMoveDisclosure || "Expected Move is Schwab raw when provided; otherwise POPPA’S calculates it from Underlying × IV × sqrt(DTE / 365) and labels the fallback.",
    building: !!board.building,
    progress: board.progress || null,
    total: board.withCondor ?? rows.length,
    matched: rows.length,
    returned: rows.length,
    filterMode: "unfiltered-board",
    serverFiltersRemoved: true,
    userMessage: "All pulled scanner-board candidates are returned with source/method labels. Use the Define your return band controls on the scanner page to narrow the display. Educational review only; not trade recommendations.",
    validationEndpoint: "/.netlify/functions/schwab-validation-snapshot?symbol=AAPL",
    results: rows
  }, board.building ? 60 : 600);
};