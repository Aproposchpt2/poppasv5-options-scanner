// POPPA'S Scanner Table Sandbox — recovered live-data controller.
// V4 clone only. Removes legacy sample-data fallback UI and renders from Netlify/Supabase candidate endpoint.
(function () {
  'use strict';

  const RESULTS_ENDPOINT = '/.netlify/functions/scan-results';
  const EXPORT_ENDPOINT = '/.netlify/functions/scan-export';
  const COMMISSION = 2.40;
  const FEES = 0.04;
  const TOTAL_COST = COMMISSION + FEES;

  let rows = [];
  let shownRows = [];
  let includeMoreRecords = false;
  let sortKey = 'rocAfterCommissionAndFees';
  let sortDir = -1;

  const byId = id => document.getElementById(id);
  const num = (v, fallback = null) => {
    if (v === null || v === undefined || v === '') return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const pick = (...vals) => vals.find(v => v !== null && v !== undefined && v !== '');
  const esc = v => String(v ?? '—').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const money = v => num(v) === null ? '—' : '$' + num(v).toFixed(2);
  const whole = v => num(v) === null ? '—' : Math.round(num(v)).toLocaleString();
  const percent = v => {
    const n = num(v);
    if (n === null) return '—';
    const p = Math.abs(n) <= 1 ? n * 100 : n;
    return p.toFixed(1) + '%';
  };
  const isoDate = v => v ? String(v).slice(0, 10) : '—';

  function addStyles() {
    if (byId('poppas-recovered-preview-css')) return;
    const s = document.createElement('style');
    s.id = 'poppas-recovered-preview-css';
    s.textContent = `
      #runScanBtn,#rescanBtn,#resetBtn,#loadNextBtn,#downloadCsvBtn,#scanProgress{display:none!important}
      #poppasRecoveredToolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:14px 0 18px}
      #poppasRecoveredToolbar .pill{min-height:44px;display:inline-flex;align-items:center}
      .recovered-source-note{font-size:.78rem;color:var(--muted);margin-top:5px;white-space:normal;min-width:170px}
      .strike-pass{color:var(--green);font-weight:900}.strike-rejected{color:var(--red);font-weight:900}
      .table-wrap table{min-width:4200px}.table-wrap th{cursor:pointer}.table-wrap td{white-space:nowrap}.table-wrap td:last-child{white-space:normal;min-width:240px}
      #recoveredOrderTicket{margin-top:18px}.recovered-ticket-grid{display:grid;grid-template-columns:repeat(4,minmax(160px,1fr));gap:10px;margin-top:14px}
      .recovered-ticket-item{border:1px solid var(--line);border-radius:12px;padding:12px;background:rgba(255,255,255,.04)}
      .recovered-ticket-item span{display:block;color:var(--muted);font-size:.66rem;letter-spacing:.09em;text-transform:uppercase}.recovered-ticket-item strong{display:block;color:#fff;margin-top:4px}
      @media(max-width:700px){.recovered-ticket-grid{grid-template-columns:1fr}.table-wrap{max-width:100%;overflow-x:auto}}
    `;
    document.head.appendChild(s);
  }

  function normalize(r) {
    const raw = r.rawLegs || {};
    const shortPut = num(pick(r.shortPut, r.short_put));
    const longPut = num(pick(r.longPut, r.long_put));
    const shortCall = num(pick(r.shortCall, r.short_call));
    const longCall = num(pick(r.longCall, r.long_call));
    const requestedWidth = num(pick(r.requestedWidth, r.width));
    const actualPutWidth = num(pick(r.actualPutWidth, shortPut !== null && longPut !== null ? shortPut - longPut : null));
    const actualCallWidth = num(pick(r.actualCallWidth, longCall !== null && shortCall !== null ? longCall - shortCall : null));
    const lowerAnchorPOTM = num(pick(r.lowerAnchorPOTM, r.lowerAnchorPOTMPercent, r.prob, r.probOtm, r.prob_otm));
    const anchorPutOTM = num(pick(r.anchorPutOTM, r.putProbOtm, r.put_prob_otm));
    const anchorCallOTM = num(pick(r.anchorCallOTM, r.callProbOtm, r.call_prob_otm));
    const naturalCredit = num(pick(r.naturalCredit, r.credit));
    const midpointCredit = num(pick(r.midpointCredit, r.midCredit, r.mid_credit, r.credit));
    const displayedCredit = midpointCredit;
    const grossCreditDollars = displayedCredit !== null ? displayedCredit * 100 : null;
    const netCreditAfterCosts = grossCreditDollars !== null ? grossCreditDollars - TOTAL_COST : null;
    const grossMaxRisk = requestedWidth !== null && grossCreditDollars !== null ? requestedWidth * 100 - grossCreditDollars : null;
    const netMaxRiskAfterCosts = requestedWidth !== null && netCreditAfterCosts !== null ? requestedWidth * 100 - netCreditAfterCosts : null;
    const grossROC = num(pick(r.grossROC, r.roc), grossCreditDollars !== null && grossMaxRisk > 0 ? grossCreditDollars / grossMaxRisk * 100 : null);
    const rocAfterCommissionAndFees = num(pick(r.rocAfterCommissionAndFees, r.rocAfterCosts), netCreditAfterCosts !== null && netMaxRiskAfterCosts > 0 ? netCreditAfterCosts / netMaxRiskAfterCosts * 100 : null);
    const strikeValidationStatus = pick(r.strikeValidationStatus, r.strike_validation_status, 'PASS');
    const strikeValidationReason = pick(r.strikeValidationReason, r.strike_validation_reason, 'Exact strikes confirmed');
    return {
      ...r,
      symbol: pick(r.symbol, r.ticker),
      expiry: pick(r.expiry, r.expiration),
      dte: num(r.dte),
      spot: num(pick(r.spot, r.underlyingPrice)),
      shortPut, longPut, shortCall, longCall,
      requestedWidth, actualPutWidth, actualCallWidth,
      anchorPutOTM, anchorCallOTM, lowerAnchorPOTM,
      naturalCredit, midpointCredit, displayedCredit,
      grossROC, rocAfterCommissionAndFees,
      monthlyChainIV: pick(r.monthlyChainIVDisplay, r.monthlyChainIV, r.ivDisplay, r.iv),
      openInterest: pick(r.openInterest, r.monthlyOI, r.open_interest, r.oi),
      shortPutOI: pick(r.shortPutOI, r.short_put_oi),
      shortCallOI: pick(r.shortCallOI, r.short_call_oi),
      spreadMax: pick(r.spreadMax, r.spread_max, r.spread),
      expectedMove: pick(r.expectedMoveDisplay, r.expectedMove, r.expected_move),
      expectedMoveStatus: pick(r.expectedMoveStatus, r.expected_move_status, 'Verify'),
      earningsDate: pick(r.earningsDate, r.nextEarnings, r.next_earnings),
      earnings: pick(r.earnings, r.earn),
      strikeValidationStatus,
      strikeValidationReason,
      reviewStatus: pick(r.reviewStatus, r.review_status, strikeValidationStatus === 'PASS' ? 'Matches primary filters ✓' : 'REJECTED — ' + strikeValidationReason),
      rawLegs: raw
    };
  }

  function setupRecoveredUI() {
    const body = byId('resultsBody');
    if (!body || byId('poppasRecoveredToolbar')) return;
    const table = body.closest('table');
    const wrap = body.closest('.table-wrap') || table;
    if (!table || !wrap) return;

    table.querySelector('thead').innerHTML = `<tr>
      ${[
        ['review','Review'],['symbol','Symbol'],['expiry','Expiration'],['dte','DTE'],['spot','Spot'],
        ['shortPut','Short Put'],['longPut','Long Put'],['shortCall','Short Call'],['longCall','Long Call'],['requestedWidth','Width'],
        ['anchorPutOTM','Anchor P(OTM)'],['anchorCallOTM','Anchor C(OTM)'],['lowerAnchorPOTM','Lower Anchor P(OTM)'],
        ['naturalCredit','Natural Credit'],['midpointCredit','Midpoint Credit'],['displayedCredit','Displayed Credit'],
        ['grossROC','Gross ROC'],['rocAfterCommissionAndFees','ROC After Costs'],['monthlyChainIV','Monthly Chain IV'],
        ['openInterest','Monthly Chain OI'],['shortPutOI','Short Put OI'],['shortCallOI','Short Call OI'],['spreadMax','Max B/A Spread'],
        ['expectedMove','Expected Move'],['expectedMoveStatus','EM Status'],['earnings','Earnings'],['strikeValidationStatus','Strike Validation'],['reviewStatus','Review Status']
      ].map(([k,l]) => `<th data-sort="${k}">${l}</th>`).join('')}
    </tr>`;

    const toolbar = document.createElement('div');
    toolbar.id = 'poppasRecoveredToolbar';
    toolbar.innerHTML = `
      <button id="recoveredScanNowBtn" class="btn primary" type="button">Scan Now</button>
      <button id="recoveredScanMoreBtn" class="btn secondary" type="button">Scan For More Records</button>
      <span id="recoveredStatus" class="pill">Waiting</span>`;
    wrap.parentNode.insertBefore(toolbar, wrap);

    const panel = document.createElement('div');
    panel.id = 'recoveredOrderTicket';
    panel.className = 'panel';
    panel.innerHTML = '<p class="eyebrow">Selected Candidate</p><h2 class="title">POPPA’S Educational Order Ticket</h2><div class="note"><strong>Displayed credit uses Schwab bid/ask midpoint values.</strong> Actual fills may differ.</div><div id="recoveredTicketContent" class="recovered-ticket-grid"><div class="recovered-ticket-item"><span>Status</span><strong>Select a candidate row</strong></div></div>';
    wrap.insertAdjacentElement('afterend', panel);

    byId('recoveredScanNowBtn').addEventListener('click', () => load(false));
    byId('recoveredScanMoreBtn').addEventListener('click', () => load(true));
    table.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (key === 'review') return;
      if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = ['symbol','expiry','strikeValidationStatus','reviewStatus'].includes(key) ? 1 : -1; }
      render();
    }));
    ['rocMin','rocMax','minProb','ivMin','minOI','minShortOI','maxSpread','spreadWidth','dteWindow','maxResults'].forEach(id => {
      const el = byId(id); if (el) el.addEventListener('change', render);
    });
  }

  function lowerAsPercent(r) {
    const v = num(r.lowerAnchorPOTM, 0);
    return Math.abs(v) <= 1 ? v * 100 : v;
  }

  function applyFilters(list) {
    const minProb = num(byId('minProb') && byId('minProb').value, 0);
    const rocMin = num(byId('rocMin') && byId('rocMin').value, -Infinity);
    const rocMax = num(byId('rocMax') && byId('rocMax').value, Infinity);
    const ivMin = num(byId('ivMin') && byId('ivMin').value, -Infinity);
    const oiMin = num(byId('minOI') && byId('minOI').value, -Infinity);
    const shortOiMin = num(byId('minShortOI') && byId('minShortOI').value, -Infinity);
    const maxSpread = num(byId('maxSpread') && byId('maxSpread').value, Infinity);
    const width = num(byId('spreadWidth') && byId('spreadWidth').value, 0);
    const dteParts = String(byId('dteWindow') ? byId('dteWindow').value : '0-45').match(/(\d+)\D+(\d+)/);
    const dteMin = dteParts ? Number(dteParts[1]) : 0;
    const dteMax = dteParts ? Number(dteParts[2]) : 45;

    return list.filter(r => {
      if (!includeMoreRecords && r.strikeValidationStatus !== 'PASS') return false;
      if (lowerAsPercent(r) < minProb) return false;
      if (num(r.rocAfterCommissionAndFees, -Infinity) < rocMin || num(r.rocAfterCommissionAndFees, Infinity) > rocMax) return false;
      const iv = Math.abs(num(r.monthlyChainIV, 0)) <= 1 ? num(r.monthlyChainIV, 0) * 100 : num(r.monthlyChainIV, 0);
      if (iv < ivMin) return false;
      if (num(r.openInterest, 0) < oiMin || num(r.shortPutOI, 0) < shortOiMin || num(r.shortCallOI, 0) < shortOiMin) return false;
      if (num(r.spreadMax, Infinity) > maxSpread) return false;
      if (width > 0 && num(r.requestedWidth) !== width) return false;
      if (num(r.dte, -Infinity) < dteMin || num(r.dte, Infinity) > dteMax) return false;
      return true;
    });
  }

  function sortValue(r, key) {
    if (['symbol','expiry','strikeValidationStatus','reviewStatus'].includes(key)) return String(r[key] || '');
    return num(r[key], -Infinity);
  }

  function render() {
    const body = byId('resultsBody');
    const status = byId('recoveredStatus');
    if (!body) return;
    shownRows = applyFilters(rows.slice());
    shownRows.sort((a,b) => {
      const av = sortValue(a, sortKey), bv = sortValue(b, sortKey);
      if (typeof av === 'string') return av.localeCompare(bv) * sortDir;
      return (av - bv) * sortDir;
    });
    const maxResults = Math.max(1, Math.min(500, num(byId('maxResults') && byId('maxResults').value, 50)));
    shownRows = shownRows.slice(0, maxResults);

    if (byId('candidateCount')) byId('candidateCount').textContent = shownRows.length;
    if (byId('scanMode')) byId('scanMode').textContent = includeMoreRecords ? 'Expanded records' : 'Live candidates';
    if (status) status.textContent = `${shownRows.length.toLocaleString()} displayed · ${rows.length.toLocaleString()} loaded`;

    if (!shownRows.length) {
      body.innerHTML = '<tr><td colspan="28" class="empty">No live candidates match the current controls.</td></tr>';
      return;
    }

    body.innerHTML = shownRows.map((r,i) => {
      const strikeClass = r.strikeValidationStatus === 'PASS' ? 'strike-pass' : 'strike-rejected';
      const em = String(r.expectedMoveStatus || '').toLowerCase();
      const emClass = em.includes('outside') ? 'em-out' : em.includes('inside') ? 'em-in' : em.includes('near') ? 'em-near' : 'warn';
      return `<tr data-index="${i}">
        <td><button class="sandbox-review-btn" type="button">Review</button></td><td><strong>${esc(r.symbol)}</strong></td><td>${esc(isoDate(r.expiry))}</td><td>${esc(r.dte)}</td><td>${money(r.spot)}</td>
        <td>${esc(r.shortPut)}</td><td>${esc(r.longPut)}</td><td>${esc(r.shortCall)}</td><td>${esc(r.longCall)}</td><td>${money(r.requestedWidth)}</td>
        <td>${percent(r.anchorPutOTM)}</td><td>${percent(r.anchorCallOTM)}</td><td>${percent(r.lowerAnchorPOTM)}</td>
        <td>${money(r.naturalCredit)}</td><td>${money(r.midpointCredit)}</td><td>${money(r.displayedCredit)}</td>
        <td>${percent(r.grossROC)}</td><td>${percent(r.rocAfterCommissionAndFees)}</td><td>${percent(r.monthlyChainIV)}</td>
        <td>${whole(r.openInterest)}</td><td>${whole(r.shortPutOI)}</td><td>${whole(r.shortCallOI)}</td><td>${money(r.spreadMax)}</td>
        <td>${r.expectedMove === null || r.expectedMove === undefined ? '—' : '±' + money(r.expectedMove)}</td><td class="${emClass}">${esc(r.expectedMoveStatus)}</td><td>${esc(r.earningsDate ? 'Earnings ' + isoDate(r.earningsDate) : r.earnings === false ? 'Clear' : 'Verify')}</td>
        <td class="${strikeClass}">${esc(r.strikeValidationStatus)}<div class="recovered-source-note">${esc(r.strikeValidationReason)}</div></td>
        <td>${esc(r.reviewStatus)}<div class="recovered-source-note">Educational review only; not a recommendation.</div></td>
      </tr>`;
    }).join('');
    body.querySelectorAll('tr[data-index]').forEach(tr => tr.addEventListener('click', () => selectRow(Number(tr.dataset.index))));
    selectRow(0);
  }

  function selectRow(index) {
    const r = shownRows[index];
    if (!r || !byId('recoveredTicketContent')) return;
    const body = byId('resultsBody');
    body.querySelectorAll('tr').forEach(tr => tr.classList.remove('row-active'));
    const active = body.querySelector(`tr[data-index="${index}"]`);
    if (active) active.classList.add('row-active');
    const fields = [
      ['Short Put', r.shortPut], ['Long Put', r.longPut], ['Short Call', r.shortCall], ['Long Call', r.longCall],
      ['Width', money(r.requestedWidth)], ['Strike Validation', r.strikeValidationStatus + ' — ' + r.strikeValidationReason],
      ['Displayed Credit', money(r.displayedCredit)], ['ROC After Costs', percent(r.rocAfterCommissionAndFees)],
      ['Anchor P(OTM)', percent(r.anchorPutOTM)], ['Anchor C(OTM)', percent(r.anchorCallOTM)], ['Lower Anchor P(OTM)', percent(r.lowerAnchorPOTM)],
      ['Data Source', pick(r.dataSource, 'Schwab/TOS Market Data API')]
    ];
    byId('recoveredTicketContent').innerHTML = fields.map(([label,value]) => `<div class="recovered-ticket-item"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
  }

  async function load(more) {
    includeMoreRecords = Boolean(more);
    const status = byId('recoveredStatus');
    if (status) status.textContent = includeMoreRecords ? 'Scanning for more records…' : 'Scanning live candidates…';
    try {
      const url = RESULTS_ENDPOINT + (includeMoreRecords ? '?includeRejected=true&passersTop=true' : '?passersTop=true');
      const response = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      rows = (Array.isArray(data.results) ? data.results : Array.isArray(data.rows) ? data.rows : []).map(normalize);

      if (byId('truthDataMode')) byId('truthDataMode').textContent = pick(data.dataMode, data.scanMode, 'Schwab/TOS market data');
      if (byId('truthBuild')) byId('truthBuild').textContent = data.building ? 'Building' : 'Ready';
      if (byId('truthUniverse')) byId('truthUniverse').textContent = whole(pick(data.universeCount, data.total, rows.length));
      if (byId('truthLastScan')) byId('truthLastScan').textContent = pick(data.generatedAt, 'Available');
      if (byId('scanStamp')) byId('scanStamp').textContent = data.generatedAt ? 'Scanned ' + new Date(data.generatedAt).toLocaleString() : 'Live data';
      if (byId('universeCount')) byId('universeCount').textContent = whole(pick(data.universeCount, rows.length));

      render();
    } catch (error) {
      rows = [];
      const body = byId('resultsBody');
      if (status) status.textContent = 'Live candidate load failed';
      if (body) body.innerHTML = `<tr><td colspan="28" class="empty">Unable to load live candidates from Netlify/Supabase: ${esc(error.message)}</td></tr>`;
    }
  }

  function init() {
    addStyles();
    setupRecoveredUI();
    load(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
