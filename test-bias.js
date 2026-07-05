// test-bias.js — standalone test for Hybrid Price-Action Bias calculation.
// Run: node test-bias.js
// Uses the same fetchCandles / emaHistory / calcBias logic as scan-results-preview.js.
// Requires Node 18+ (built-in fetch).

async function fetchCandles(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) { console.warn(`  [${symbol}] HTTP ${resp.status}`); return null; }
    const data = await resp.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const ts = result.timestamp || [];
    const q  = result.indicators?.quote?.[0] || {};
    const candles = [];
    for (let i = 0; i < ts.length; i++) {
      if (q.close?.[i] != null && q.high?.[i] != null && q.low?.[i] != null) {
        candles.push({ t: new Date(ts[i] * 1000).toISOString().slice(0, 10), h: q.high[i], l: q.low[i], c: q.close[i] });
      }
    }
    return candles;
  } catch (e) {
    console.warn(`  [${symbol}] fetch error: ${e.message}`);
    return null;
  }
}

function emaHistory(closes, period) {
  if (closes.length < period) return [];
  const k = 2 / (period + 1);
  let e = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const out = [e];
  for (let i = period; i < closes.length; i++) { e = closes[i] * k + e * (1 - k); out.push(e); }
  return out;
}

function calcBias(symbol, candles) {
  const today = new Date().toISOString().slice(0, 10);
  if (!candles || candles.length < 35) {
    return { symbol, directionalBias: 'Neutral', biasScore: 0, biasReason: 'Insufficient data', biasAsOf: today, candleCount: candles?.length ?? 0 };
  }

  const n = candles.length, closes = candles.map(c => c.c), highs = candles.map(c => c.h), lows = candles.map(c => c.l);
  const close = closes[n - 1], asOf = candles[n - 1].t;

  const ema20a = emaHistory(closes, 20), ema50a = emaHistory(closes, 50);
  const ema20 = ema20a[ema20a.length - 1], ema50 = ema50a.length > 0 ? ema50a[ema50a.length - 1] : null;
  const slope20 = ema20a.length >= 6 ? ema20a[ema20a.length - 1] - ema20a[ema20a.length - 6] : 0;

  let c1 = 0, c1txt = 'trend is mixed or flat';
  if (ema50 !== null && close > ema20 && ema20 > ema50 && slope20 > 0) { c1 = 1; c1txt = 'trend is positive'; }
  else if (ema50 !== null && close < ema20 && ema20 < ema50 && slope20 < 0) { c1 = -1; c1txt = 'trend is negative'; }

  const pH = [], pL = [];
  for (let i = 2; i < n - 2; i++) {
    if (highs[i] > highs[i-1] && highs[i] > highs[i-2] && highs[i] > highs[i+1] && highs[i] > highs[i+2]) pH.push(highs[i]);
    if (lows[i]  < lows[i-1]  && lows[i]  < lows[i-2]  && lows[i]  < lows[i+1]  && lows[i]  < lows[i+2])  pL.push(lows[i]);
  }
  let c2 = 0, c2txt = 'pivots are mixed or insufficient';
  if (pH.length >= 2 && pL.length >= 2) {
    if (pH[pH.length-1] > pH[pH.length-2] && pL[pL.length-1] > pL[pL.length-2])      { c2 = 1;  c2txt = 'pivot structure is bullish'; }
    else if (pH[pH.length-1] < pH[pH.length-2] && pL[pL.length-1] < pL[pL.length-2]) { c2 = -1; c2txt = 'pivot structure is bearish'; }
    else { c2txt = 'pivot structure is mixed'; }
  }

  const r20H = Math.max(...highs.slice(-20)), r20L = Math.min(...lows.slice(-20)), rng = r20H - r20L;
  let c3 = 0, c3txt = 'price is mid-range';
  if (rng > 0) {
    const pos = (close - r20L) / rng;
    if (pos >= 0.60) { c3 = 1; c3txt = 'price is in upper range'; }
    else if (pos <= 0.40) { c3 = -1; c3txt = 'price is in lower range'; }
  }

  const score = c1 + c2 + c3;
  const bias  = score >= 2 ? 'Bullish' : score <= -2 ? 'Bearish' : 'Neutral';

  let reason;
  if (score === 3) reason = 'Trend, pivot structure, and range location all confirm upside posture.';
  else if (score === -3) reason = 'Price below trend averages, lower highs and lower lows, and in lower range.';
  else { const s = c1txt.charAt(0).toUpperCase() + c1txt.slice(1); reason = `${s}, ${c2txt}, and ${c3txt}.`; }

  return { symbol, directionalBias: bias, biasScore: score, biasReason: reason, biasAsOf: asOf,
           candleCount: n, close: close.toFixed(2), ema20: ema20.toFixed(2), ema50: ema50?.toFixed(2) ?? 'n/a',
           slope20: slope20.toFixed(4), c1, c2, c3, pivotHighs: pH.length, pivotLows: pL.length };
}

const SYMBOLS = ['NVDA', 'AAPL', 'SPY', 'META', 'INTC', 'MU', 'TSLA', 'MSFT'];

(async () => {
  console.log('\n=== POPPA\'S Directional Bias — Test Run ===');
  console.log(`Symbols: ${SYMBOLS.join(', ')}\n`);

  const results = await Promise.all(SYMBOLS.map(async sym => {
    console.log(`  Fetching ${sym}...`);
    const candles = await fetchCandles(sym);
    return calcBias(sym, candles);
  }));

  console.log('\n── Results ─────────────────────────────────────────────────────');
  const bulls = [], bears = [], neutrals = [];
  for (const r of results) {
    const tag = r.directionalBias === 'Bullish' ? '🟢' : r.directionalBias === 'Bearish' ? '🔴' : '⚪';
    const scoreStr = r.biasScore > 0 ? `+${r.biasScore}` : String(r.biasScore);
    console.log(`\n${tag} ${r.symbol} — ${r.directionalBias} (${scoreStr})`);
    console.log(`   Reason : ${r.biasReason}`);
    console.log(`   As Of  : ${r.biasAsOf}  |  Candles: ${r.candleCount}  |  Close: $${r.close}`);
    console.log(`   EMA20: ${r.ema20}  EMA50: ${r.ema50}  Slope20(5d): ${r.slope20}`);
    console.log(`   C1=${r.c1} (trend)  C2=${r.c2} (pivots: ${r.pivotHighs}H/${r.pivotLows}L)  C3=${r.c3} (range)`);

    if (r.directionalBias === 'Bullish') bulls.push(r.symbol);
    else if (r.directionalBias === 'Bearish') bears.push(r.symbol);
    else neutrals.push(r.symbol);
  }

  console.log('\n── Summary ─────────────────────────────────────────────────────');
  console.log(`  Bullish : ${bulls.join(', ') || '(none)'}`);
  console.log(`  Bearish : ${bears.join(', ') || '(none)'}`);
  console.log(`  Neutral : ${neutrals.join(', ') || '(none)'}`);

  const allThree = bulls.length > 0 && bears.length > 0 && neutrals.length > 0;
  console.log(`\n  All three bias values represented: ${allThree ? 'YES ✓' : 'NO — may need additional symbols'}`);
  console.log('\n=== Test complete ===\n');
})();
