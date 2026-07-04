// POPPA'S Scanner Table Sandbox — stable live controller with premium graph, manual scan, and public-safe messaging.
(function () {
  'use strict';

  const RESULTS_ENDPOINT = '/.netlify/functions/scan-results';
  const COMMISSION = 2.40;
  const FEES = 0.04;
  const TOTAL_COST = COMMISSION + FEES;
  let rows = [];
  let shownRows = [];
  let includeMoreRecords = false;
  let sortKey = 'rocAfterCommissionAndFees';
  let sortDir = -1;

  const $ = id => document.getElementById(id);
  const num = (v, d = null) => {
    if (v === null || v === undefined || v === '') return d;
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
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
    if ($('poppas-v4-live-controller-css')) return;
    const s = document.createElement('style');
    s.id = 'poppas-v4-live-controller-css';
    s.textContent = `
      #resetBtn,#loadNextBtn,#downloadCsvBtn,#scanProgress{display:none!important}
      #runScanBtn,#rescanBtn{display:inline-flex!important;visibility:visible!important;opacity:1!important;align-items:center;justify-content:center}
      #runScanBtn{background:#fff!important;color:#04101f!important}
      #rescanBtn{border:1px solid var(--line2)!important;background:rgba(255,255,255,.055)!important;color:#fff!important}
      #poppasLiveStatus{display:block;margin:14px 0 0;border-left:4px solid var(--cyan);border-radius:0 12px 12px 0;padding:14px 16px;background:rgba(30,167,255,.10);color:#eaf3ff;font-weight:800;letter-spacing:.02em;min-height:52px}
      #poppasLiveStatus strong{color:#fff}.table-wrap{display:block!important;visibility:visible!important}.table-wrap table{min-width:4200px}.table-wrap th{cursor:pointer}.table-wrap td{white-space:nowrap}.table-wrap td:last-child{white-space:normal;min-width:240px}
      .strike-pass{color:var(--green);font-weight:900}.strike-rejected{color:var(--red);font-weight:900}.recovered-source-note{font-size:.78rem;color:var(--muted);margin-top:5px;white-space:normal;min-width:170px}
      .ticket-live-grid{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:14px;margin-top:14px}.ticket-math-grid{display:grid;grid-template-columns:repeat(5,minmax(130px,1fr));gap:14px;margin-top:14px}
      .ticket-live-item{border:1px solid rgba(191,214,255,.26);border-radius:15px;padding:15px 16px;background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.025));min-height:88px}.ticket-live-item span{display:block;color:var(--cyan);font-size:.7rem;line-height:1.1;letter-spacing:.12em;text-transform:uppercase;font-weight:900}.ticket-live-item strong{display:block;color:#fff;font-size:1.2rem;margin-top:7px;line-height:1.1}.ticket-live-item.small strong{font-size:1.04rem}.ticket-live-item.anchor strong{color:var(--red)}.ticket-live-item.offset strong{color:var(--green)}.ticket-card-note{border-left:4px solid var(--cyan);background:rgba(30,167,255,.1);padding:14px 16px;border-radius:0 12px 12px 0;margin:14px 0 4px;color:#eaf3ff;font-weight:700}.ticket-card-title{font-family:var(--disp);font-size:2rem;line-height:1.05;color:#fff;margin:2px 0 8px}
      #liveStrikeGraph{margin-top:18px}.premium-graph-panel{background:radial-gradient(circle at 50% 0%,rgba(30,167,255,.18),rgba(255,255,255,.045) 45%,rgba(255,255,255,.025));border:1px solid rgba(191,214,255,.22);border-radius:22px;padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.36)}.premium-graph-title{font-family:var(--disp);font-size:2rem;line-height:1.05;color:#fff;margin:2px 0 8px}.premium-graph-sub{border-left:4px solid var(--cyan);background:rgba(30,167,255,.1);padding:12px 15px;border-radius:0 12px 12px 0;color:#eaf3ff;font-weight:700;margin-bottom:18px}.premium-graph{position:relative;height:250px;border:1px solid rgba(191,214,255,.22);border-radius:18px;background:linear-gradient(180deg,rgba(6,18,37,.92),rgba(2,8,22,.95));overflow:hidden}.premium-graph:before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(123,220,255,.05) 1px,transparent 1px),linear-gradient(180deg,rgba(123,220,255,.05) 1px,transparent 1px);background-size:80px 80px;opacity:.8}.premium-axis{position:absolute;left:5%;right:5%;top:126px;height:2px;background:rgba(191,214,255,.38)}.premium-profit{position:absolute;top:94px;height:64px;border-radius:999px;background:linear-gradient(90deg,rgba(62,227,145,.16),rgba(62,227,145,.28),rgba(62,227,145,.16));border:1px solid rgba(62,227,145,.45);box-shadow:0 0 34px rgba(62,227,145,.12)}.premium-em{position:absolute;top:174px;height:18px;border-radius:999px;background:rgba(242,180,71,.20);border:1px solid rgba(242,180,71,.48)}.premium-marker{position:absolute;top:58px;width:3px;height:118px;border-radius:999px;box-shadow:0 0 18px rgba(255,255,255,.35)}.premium-marker.short{background:var(--red)}.premium-marker.long{background:var(--green)}.premium-marker.spot{background:#fff;width:4px;box-shadow:0 0 22px rgba(123,220,255,.9)}.premium-marker label{position:absolute;left:50%;top:-38px;transform:translateX(-50%);white-space:nowrap;display:inline-block;border:1px solid rgba(191,214,255,.32);border-radius:999px;padding:6px 10px;background:rgba(2,8,22,.94);color:#fff;font-size:.67rem;letter-spacing:.08em;font-weight:900;text-transform:uppercase}.premium-marker.low label{top:125px}.premium-scale{position:absolute;left:5%;right:5%;bottom:14px;display:flex;justify-content:space-between;color:#88a7d8;font-weight:700}.premium-graph-meta{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:12px;margin-top:14px}.premium-graph-meta div{border:1px solid rgba(191,214,255,.22);border-radius:14px;background:rgba(255,255,255,.04);padding:13px}.premium-graph-meta span{display:block;color:var(--muted);font-size:.65rem;letter-spacing:.12em;text-transform:uppercase;font-weight:900}.premium-graph-meta strong{display:block;color:#fff;font-size:1.08rem;margin-top:4px}.premium-graph-note{margin-top:12px;color:var(--muted);font-size:.9rem}.premium-graph-note b{color:#fff}.poppas-footer-brand{width:100%;text-align:center;font-family:var(--disp);font-size:2.25rem;line-height:1.15;color:#fff;font-weight:800;letter-spacing:.06em;text-transform:uppercase}.poppas-footer-brand span{display:block;margin-top:8px;font-family:var(--body);font-size:1rem;letter-spacing:.22em;color:var(--gold);font-weight:900}
      @media(max-width:800px){.ticket-live-grid,.ticket-math-grid,.premium-graph-meta{grid-template-columns:1fr}.table-wrap{max-width:100%;overflow-x:auto}.poppas-footer-brand{font-size:1.55rem}.poppas-footer-brand span{font-size:.82rem}.premium-marker label{font-size:.58rem}}
    `;
    document.head.appendChild(s);
  }

  function setStatus(message, tone = 'info') {
    const el = ensureStatus();
    if (!el) return;
    const color = tone === 'error' ? 'var(--red)' : tone === 'success' ? 'var(--green)' : tone === 'warn' ? 'var(--amber)' : 'var(--cyan)';
    el.style.borderLeftColor = color;
    el.innerHTML = message;
    const pill = $('recoveredStatus');
    if (pill) pill.textContent = el.textContent.trim();
  }

  function ensureStatus() {
    let el = $('poppasLiveStatus');
    if (el) return el;
    const run = $('runScanBtn');
    const host = run ? (run.closest('.actions') || run.parentElement) : null;
    if (!host) return null;
    el = document.createElement('div');
    el.id = 'poppasLiveStatus';
    host.insertAdjacentElement('afterend', el);
    return el;
  }

  function normalize(r) {
    const shortPut = num(pick(r.shortPut, r.short_put));
    const longPut = num(pick(r.longPut, r.long_put));
    const shortCall = num(pick(r.shortCall, r.short_call));
    const longCall = num(pick(r.longCall, r.long_call));
    const requestedWidth = num(pick(r.requestedWidth, r.width));
    const anchorPutOTM = num(pick(r.anchorPutOTM, r.putProbOtm, r.put_prob_otm));
    const anchorCallOTM = num(pick(r.anchorCallOTM, r.callProbOtm, r.call_prob_otm));
    const lowerAnchorPOTM = num(pick(r.lowerAnchorPOTM, r.lowerAnchorPOTMPercent, r.prob, r.probOtm, r.prob_otm));
    const naturalCredit = num(pick(r.naturalCredit, r.credit));
    const midpointCredit = num(pick(r.midpointCredit, r.midCredit, r.mid_credit, r.credit));
    const displayedCredit = num(pick(r.displayedCredit, r.displayed_credit, midpointCredit));
    const grossCreditDollars = displayedCredit !== null ? displayedCredit * 100 : null;
    const netCreditAfterCosts = grossCreditDollars !== null ? grossCreditDollars - TOTAL_COST : null;
    const grossMaxRisk = requestedWidth !== null && grossCreditDollars !== null ? requestedWidth * 100 - grossCreditDollars : null;
    const netMaxRiskAfterCosts = requestedWidth !== null && netCreditAfterCosts !== null ? requestedWidth * 100 - netCreditAfterCosts : null;
    const grossROC = num(pick(r.grossROC, r.roc), grossCreditDollars !== null && grossMaxRisk > 0 ? grossCreditDollars / grossMaxRisk * 100 : null);
    const rocAfterCommissionAndFees = num(pick(r.rocAfterCommissionAndFees, r.rocAfterCosts), netCreditAfterCosts !== null && netMaxRiskAfterCosts > 0 ? netCreditAfterCosts / netMaxRiskAfterCosts * 100 : null);
    const strikeValidationStatus = pick(r.strikeValidationStatus, r.strike_validation_status, 'PASS');
    return { ...r, symbol: pick(r.symbol, r.ticker), expiry: pick(r.expiry, r.expiration), dte: num(r.dte), spot: num(pick(r.spot, r.underlyingPrice)), shortPut, longPut, shortCall, longCall, requestedWidth, actualPutWidth: num(pick(r.actualPutWidth, shortPut !== null && longPut !== null ? shortPut - longPut : null)), actualCallWidth: num(pick(r.actualCallWidth, longCall !== null && shortCall !== null ? longCall - shortCall : null)), anchorPutOTM, anchorCallOTM, lowerAnchorPOTM, naturalCredit, midpointCredit, displayedCredit, grossROC, rocAfterCommissionAndFees, maxRiskAfterCosts: netMaxRiskAfterCosts !== null ? netMaxRiskAfterCosts / 100 : null, monthlyChainIV: pick(r.monthlyChainIVDisplay, r.monthlyChainIV, r.ivDisplay, r.iv), openInterest: pick(r.openInterest, r.monthlyOI, r.open_interest, r.oi), shortPutOI: pick(r.shortPutOI, r.short_put_oi), shortCallOI: pick(r.shortCallOI, r.short_call_oi), spreadMax: pick(r.spreadMax, r.spread_max, r.spread), expectedMove: pick(r.expectedMoveDisplay, r.expectedMove, r.expected_move), expectedMoveStatus: pick(r.expectedMoveStatus, r.expected_move_status, 'Verify'), earningsDate: pick(r.earningsDate, r.nextEarnings, r.next_earnings), earnings: pick(r.earnings, r.earn), strikeValidationStatus, strikeValidationReason: pick(r.strikeValidationReason, r.strike_validation_reason, 'Validation pending; database row has no rejection status'), reviewStatus: pick(r.reviewStatus, r.review_status, 'Matches primary filters ✓') };
  }

  function cleanupContent() {
    const hideText = ['Wider sortable table · Short OI column removed', 'Preview-page source-of-truth test', 'No backend filtering: Run Scanner Now calls', 'Supabase', 'Netlify', 'Postgres', 'REST'];
    Array.from(document.querySelectorAll('h1,h2,h3,p,div,details,summary')).forEach(el => {
      const txt = (el.textContent || '').trim();
      if (hideText.some(t => txt.includes(t))) {
        if (el.id === 'poppasLiveStatus') return;
        const container = el.closest('details') || el.closest('.card') || el.closest('.panel') || el;
        container.style.display = 'none';
      }
    });
    const faq = $('faq');
    if (faq && !$('poppasFaqReplacement')) {
      const box = document.createElement('div');
      box.id = 'poppasFaqReplacement';
      box.className = 'panel';
      box.innerHTML = '<p class="eyebrow">FAQ</p><h2 class="title">Scanner questions</h2><div class="cards5"><div class="card"><h3>Where is the scanner data sourced from?</h3><p>Market data is sourced from professional market-data feeds and processed through POPPA\'S Strategy OS for educational Iron Condor candidate analysis.</p></div><div class="card"><h3>What does Scan For More Records do?</h3><p>It expands the visible candidate set for additional educational review.</p></div><div class="card"><h3>Are these trade recommendations?</h3><p>No. Rows are educational candidates only. Pricing, liquidity, expiration, earnings, and risk must be verified independently.</p></div><div class="card"><h3>What is ROC After Cost?</h3><p>It estimates return after standard commission and fee assumptions are included.</p></div><div class="card"><h3>What does Anchor P(OTM) mean?</h3><p>It is an anchor-leg probability metric, not a guaranteed whole-condor probability.</p></div></div>';
      faq.appendChild(box);
    }
    Array.from(document.querySelectorAll('.foot,footer')).forEach(f => {
      f.innerHTML = '<div class="poppas-footer-brand">POPPA\'S STRATEGY OS<span>ENGINEERED BY INNOVATIVE INTELLIGENCE</span></div>';
      f.style.justifyContent = 'center';
      f.style.textAlign = 'center';
    });
  }

  function setupButtons() {
    const run = $('runScanBtn');
    const more = $('rescanBtn') || $('loadNextBtn');
    if (run) { run.textContent = 'Scan Now'; run.onclick = e => { e.preventDefault(); load(false); }; }
    if (more) { more.textContent = 'Scan For More Records'; more.onclick = e => { e.preventDefault(); load(true); }; }
    ensureStatus();
  }

  function setupTable() {
    const body = $('resultsBody');
    if (!body || $('poppasRecoveredToolbar')) return;
    const table = body.closest('table');
    const wrap = body.closest('.table-wrap') || table;
    if (!table || !wrap) return;
    table.querySelector('thead').innerHTML = `<tr>${[['review','Review'],['symbol','Symbol'],['expiry','Expiration'],['dte','DTE'],['spot','Spot'],['shortPut','Short Put'],['longPut','Long Put'],['shortCall','Short Call'],['longCall','Long Call'],['requestedWidth','Width'],['anchorPutOTM','Put Anchor P(OTM)'],['anchorCallOTM','Call Anchor P(OTM)'],['lowerAnchorPOTM','Lower Anchor P(OTM)'],['naturalCredit','Natural Credit'],['midpointCredit','Midpoint Credit'],['displayedCredit','Displayed Credit'],['grossROC','Gross ROC'],['rocAfterCommissionAndFees','ROC After Costs'],['monthlyChainIV','Monthly Chain IV'],['openInterest','Monthly Chain OI'],['shortPutOI','Short Put OI'],['shortCallOI','Short Call OI'],['spreadMax','Max B/A Spread'],['expectedMove','Expected Move'],['expectedMoveStatus','EM Status'],['earnings','Earnings'],['strikeValidationStatus','Strike Validation'],['reviewStatus','Review Status']].map(([k,l]) => `<th data-sort="${k}">${l}</th>`).join('')}</tr>`;
    const toolbar = document.createElement('div');
    toolbar.id = 'poppasRecoveredToolbar';
    toolbar.innerHTML = '<button id="recoveredScanNowBtn" class="btn primary" type="button">Scan Now</button><button id="recoveredScanMoreBtn" class="btn secondary" type="button">Scan For More Records</button><span id="recoveredStatus" class="pill">Ready</span>';
    wrap.parentNode.insertBefore(toolbar, wrap);
    $('recoveredScanNowBtn').addEventListener('click', () => load(false));
    $('recoveredScanMoreBtn').addEventListener('click', () => load(true));
    table.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => { const key = th.dataset.sort; if (key === 'review') return; if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = ['symbol','expiry','strikeValidationStatus','reviewStatus'].includes(key) ? 1 : -1; } render(); }));
    ['rocMin','rocMax','minProb','ivMin','minOI','minShortOI','maxSpread','spreadWidth','dteWindow','maxResults'].forEach(id => { const el = $(id); if (el) el.addEventListener('change', markSettingsChanged); });
    body.innerHTML = '<tr><td colspan="28" class="empty">Adjust settings, then click Scan Now to load candidates.</td></tr>';
  }

  function markSettingsChanged() {
    setStatus('Scanner settings changed. Click <strong>Scan Now</strong> to refresh your results.', 'warn');
  }

  function lowerAsPercent(r) { const v = num(r.lowerAnchorPOTM, 0); return Math.abs(v) <= 1 ? v * 100 : v; }
  function applyFilters(list) {
    const minProb = num($('minProb') && $('minProb').value, 0);
    const rocMin = num($('rocMin') && $('rocMin').value, -Infinity);
    const rocMax = num($('rocMax') && $('rocMax').value, Infinity);
    const ivMin = num($('ivMin') && $('ivMin').value, -Infinity);
    const oiMin = num($('minOI') && $('minOI').value, -Infinity);
    const shortOiMin = num($('minShortOI') && $('minShortOI').value, -Infinity);
    const maxSpread = num($('maxSpread') && $('maxSpread').value, Infinity);
    const width = num($('spreadWidth') && $('spreadWidth').value, 0);
    const dteParts = String($('dteWindow') ? $('dteWindow').value : '0-45').match(/(\d+)\D+(\d+)/);
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
  function sortValue(r, key) { if (['symbol','expiry','strikeValidationStatus','reviewStatus'].includes(key)) return String(r[key] || ''); return num(r[key], -Infinity); }

  function render() {
    const body = $('resultsBody');
    if (!body) return;
    shownRows = applyFilters(rows.slice());
    shownRows.sort((a,b) => { const av = sortValue(a, sortKey), bv = sortValue(b, sortKey); if (typeof av === 'string') return av.localeCompare(bv) * sortDir; return (av - bv) * sortDir; });
    const maxResults = Math.max(1, Math.min(500, num($('maxResults') && $('maxResults').value, 50)));
    shownRows = shownRows.slice(0, maxResults);
    if ($('candidateCount')) $('candidateCount').textContent = shownRows.length;
    if ($('scanMode')) $('scanMode').textContent = includeMoreRecords ? 'Expanded records' : 'Live candidates';
    const pill = $('recoveredStatus');
    if (pill) pill.textContent = `${shownRows.length.toLocaleString()} displayed · ${rows.length.toLocaleString()} loaded`;
    if (!shownRows.length) { body.innerHTML = '<tr><td colspan="28" class="empty">No live candidates match the current controls.</td></tr>'; clearTicket(); clearGraph(); setStatus('<strong>Scan complete:</strong> market candidates were checked, but none match the current display controls.', 'warn'); return; }
    body.innerHTML = shownRows.map((r,i) => {
      const em = String(r.expectedMoveStatus || '').toLowerCase();
      const emClass = em.includes('outside') ? 'em-out' : em.includes('inside') ? 'em-in' : em.includes('near') ? 'em-near' : 'warn';
      return `<tr data-index="${i}"><td><button class="sandbox-review-btn" type="button">Review</button></td><td><strong>${esc(r.symbol)}</strong></td><td>${esc(isoDate(r.expiry))}</td><td>${esc(r.dte)}</td><td>${money(r.spot)}</td><td>${esc(r.shortPut)}</td><td>${esc(r.longPut)}</td><td>${esc(r.shortCall)}</td><td>${esc(r.longCall)}</td><td>${money(r.requestedWidth)}</td><td>${percent(r.anchorPutOTM)}</td><td>${percent(r.anchorCallOTM)}</td><td>${percent(r.lowerAnchorPOTM)}</td><td>${money(r.naturalCredit)}</td><td>${money(r.midpointCredit)}</td><td>${money(r.displayedCredit)}</td><td>${percent(r.grossROC)}</td><td>${percent(r.rocAfterCommissionAndFees)}</td><td>${percent(r.monthlyChainIV)}</td><td>${whole(r.openInterest)}</td><td>${whole(r.shortPutOI)}</td><td>${whole(r.shortCallOI)}</td><td>${money(r.spreadMax)}</td><td>${r.expectedMove == null ? '—' : '±' + money(r.expectedMove)}</td><td class="${emClass}">${esc(r.expectedMoveStatus)}</td><td>${esc(r.earningsDate ? 'Earnings ' + isoDate(r.earningsDate) : r.earnings === false ? 'Clear' : 'Verify')}</td><td class="strike-pass">${esc(r.strikeValidationStatus)}<div class="recovered-source-note">${esc(r.strikeValidationReason)}</div></td><td>${esc(r.reviewStatus)}<div class="recovered-source-note">Educational review only; not a recommendation.</div></td></tr>`;
    }).join('');
    body.querySelectorAll('tr[data-index]').forEach(tr => tr.addEventListener('click', () => selectRow(Number(tr.dataset.index))));
    setStatus(`<strong>Scan complete:</strong> ${shownRows.length.toLocaleString()} candidates displayed from ${rows.length.toLocaleString()} market records. Select a row to update the ticket and graph.`, 'success');
    selectRow(0);
  }

  function candidateTicketTarget() {
    if ($('liveCandidateTicketContent')) return $('liveCandidateTicketContent');
    const heading = Array.from(document.querySelectorAll('h1,h2,h3')).find(h => /candidate ticket/i.test(h.textContent || ''));
    if (!heading) return null;
    const panel = heading.closest('.panel') || heading.parentElement;
    if (!panel) return null;
    Array.from(panel.querySelectorAll('.note')).forEach(n => { if (/run a scan/i.test(n.textContent || '')) n.remove(); });
    heading.style.display = 'none';
    const target = document.createElement('div');
    target.id = 'liveCandidateTicketContent';
    panel.appendChild(target);
    return target;
  }
  function graphTarget() {
    if ($('liveStrikeGraph')) return $('liveStrikeGraph');
    const ticket = candidateTicketTarget();
    const panel = ticket && (ticket.closest('.panel') || ticket.parentElement);
    if (!panel) return null;
    const graph = document.createElement('div');
    graph.id = 'liveStrikeGraph';
    panel.insertAdjacentElement('afterend', graph);
    return graph;
  }
  function clearTicket() { const target = candidateTicketTarget(); if (target) target.innerHTML = '<p class="eyebrow">Order Ticket Preview</p><div class="ticket-card-title">Candidate Review</div><div class="ticket-card-note">Click Scan Now, then select a candidate.</div>'; }
  function clearGraph() { const target = graphTarget(); if (target) target.innerHTML = '<div class="premium-graph-panel"><p class="eyebrow">Strike Graph</p><div class="premium-graph-title">Condor strike map</div><div class="premium-graph-sub">Click Scan Now, then select a candidate to visualize the defined-risk structure.</div></div>'; }
  function ticketHtml(r) { return `<p class="eyebrow">Order Ticket Preview</p><div class="ticket-card-title">${esc(r.symbol)} Candidate Review</div><div class="ticket-card-note">Educational review only; verify pricing, liquidity, earnings, and risk independently.</div><div class="ticket-live-grid"><div class="ticket-live-item anchor"><span>Short Put</span><strong>${esc(r.shortPut)}</strong></div><div class="ticket-live-item offset"><span>Long Put</span><strong>${esc(r.longPut)}</strong></div><div class="ticket-live-item anchor"><span>Short Call</span><strong>${esc(r.shortCall)}</strong></div><div class="ticket-live-item offset"><span>Long Call</span><strong>${esc(r.longCall)}</strong></div></div><div class="ticket-math-grid"><div class="ticket-live-item small"><span>Credit</span><strong>${money(r.displayedCredit)}</strong></div><div class="ticket-live-item small"><span>Max Risk</span><strong>${money(r.maxRiskAfterCosts)}</strong></div><div class="ticket-live-item small"><span>ROC</span><strong>${percent(r.grossROC)}</strong></div><div class="ticket-live-item small"><span>ROC After Cost</span><strong>${percent(r.rocAfterCommissionAndFees)}</strong></div><div class="ticket-live-item small"><span>Lower Anchor P(OTM)</span><strong>${percent(r.lowerAnchorPOTM)}</strong></div><div class="ticket-live-item small anchor"><span>Put Anchor P(OTM)</span><strong>${percent(r.anchorPutOTM)}</strong></div><div class="ticket-live-item small anchor"><span>Call Anchor P(OTM)</span><strong>${percent(r.anchorCallOTM)}</strong></div><div class="ticket-live-item small"><span>DTE</span><strong>${esc(r.dte)}</strong></div><div class="ticket-live-item small"><span>Spot</span><strong>${money(r.spot)}</strong></div><div class="ticket-live-item small"><span>EM Status</span><strong>${esc(r.expectedMoveStatus)}</strong></div></div>`; }

  function updateGraph(r) {
    const target = graphTarget(); if (!target) return;
    const vals = [r.longPut, r.shortPut, r.spot, r.shortCall, r.longCall].map(v => num(v)).filter(v => v !== null);
    const move = num(r.expectedMove, 0), spot = num(r.spot);
    if (spot !== null && move > 0) vals.push(spot - move * 1.25, spot + move * 1.25);
    if (vals.length < 5) { target.innerHTML = '<div class="premium-graph-panel"><p class="eyebrow">Strike Graph</p><div class="premium-graph-title">Condor strike map</div><div class="premium-graph-sub">Graph unavailable: missing strike values for this row.</div></div>'; return; }
    let min = Math.min(...vals), max = Math.max(...vals); const pad = Math.max((max - min) * 0.08, 1); min -= pad; max += pad;
    const pos = v => Math.max(5, Math.min(95, 5 + ((num(v, min) - min) / (max - min)) * 90));
    const putLeft = pos(r.longPut), putShort = pos(r.shortPut), callShort = pos(r.shortCall), callRight = pos(r.longCall);
    const emLeft = spot !== null ? pos(spot - move) : 0, emRight = spot !== null ? pos(spot + move) : 0;
    const markers = [['LP', r.longPut, 'long', 'high'], ['SP', r.shortPut, 'short', 'low'], ['Spot', r.spot, 'spot', 'high'], ['SC', r.shortCall, 'short', 'low'], ['LC', r.longCall, 'long', 'high']].map(([label, value, cls, level]) => `<div class="premium-marker ${cls} ${level}" style="left:${pos(value)}%"><label>${label} ${money(value)}</label></div>`).join('');
    target.innerHTML = `<div class="premium-graph-panel"><p class="eyebrow">Strike Graph</p><div class="premium-graph-title">${esc(r.symbol)} defined-risk corridor</div><div class="premium-graph-sub">Premium strike-map view showing long offsets, short anchors, spot, and expected-move range.</div><div class="premium-graph"><div class="premium-axis"></div><div class="premium-profit" style="left:${putShort}%;width:${Math.max(1, callShort-putShort)}%"></div><div class="premium-profit" style="left:${Math.min(putLeft,putShort)}%;width:${Math.max(1, Math.abs(putShort-putLeft))}%;opacity:.35"></div><div class="premium-profit" style="left:${Math.min(callShort,callRight)}%;width:${Math.max(1, Math.abs(callRight-callShort))}%;opacity:.35"></div>${move > 0 && spot !== null ? `<div class="premium-em" style="left:${Math.min(emLeft, emRight)}%;width:${Math.max(1, Math.abs(emRight-emLeft))}%"></div>` : ''}${markers}<div class="premium-scale"><span>${money(min)}</span><span>${money(max)}</span></div></div><div class="premium-graph-meta"><div><span>Put Wing</span><strong>${esc(r.longPut)} / ${esc(r.shortPut)}</strong></div><div><span>Call Wing</span><strong>${esc(r.shortCall)} / ${esc(r.longCall)}</strong></div><div><span>Expected Move</span><strong>${move > 0 ? '±' + money(move) : '—'}</strong></div><div><span>EM Status</span><strong>${esc(r.expectedMoveStatus)}</strong></div></div><div class="premium-graph-note"><b>Red markers:</b> anchor short strikes. <b>Green markers:</b> offset long strikes. Educational visualization only.</div></div>`;
  }

  function selectRow(index) { const r = shownRows[index]; if (!r) return; const body = $('resultsBody'); if (body) { body.querySelectorAll('tr').forEach(tr => tr.classList.remove('row-active')); const active = body.querySelector(`tr[data-index="${index}"]`); if (active) active.classList.add('row-active'); } const ticket = candidateTicketTarget(); if (ticket) ticket.innerHTML = ticketHtml(r); updateGraph(r); }

  async function load(more) {
    includeMoreRecords = Boolean(more);
    setStatus(more ? '<strong>Scanning:</strong> searching for additional qualifying market candidates…' : '<strong>Scanning:</strong> searching for qualifying Iron Condor candidates…', 'info');
    try {
      const url = RESULTS_ENDPOINT + (includeMoreRecords ? '?includeRejected=true&passersTop=true' : '?passersTop=true');
      const response = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      rows = (Array.isArray(data.results) ? data.results : Array.isArray(data.rows) ? data.rows : []).map(normalize);
      if ($('truthDataMode')) $('truthDataMode').textContent = 'Live market candidates';
      if ($('truthBuild')) $('truthBuild').textContent = 'Ready';
      if ($('truthUniverse')) $('truthUniverse').textContent = whole(pick(data.universeCount, data.total, rows.length));
      if ($('truthLastScan')) $('truthLastScan').textContent = pick(data.generatedAt, 'Available');
      if ($('scanStamp')) $('scanStamp').textContent = data.generatedAt ? 'Scanned ' + new Date(data.generatedAt).toLocaleString() : 'Live data';
      if ($('universeCount')) $('universeCount').textContent = whole(pick(data.universeCount, rows.length));
      render();
    } catch (error) {
      rows = [];
      const body = $('resultsBody');
      if (body) body.innerHTML = `<tr><td colspan="28" class="empty">Unable to load market candidates: ${esc(error.message)}</td></tr>`;
      setStatus(`<strong>Scan unavailable:</strong> ${esc(error.message)}`, 'error');
      clearTicket(); clearGraph();
    }
  }

  function init() {
    addStyles();
    cleanupContent();
    setupButtons();
    setupTable();
    clearTicket();
    clearGraph();
    setStatus('Ready. Adjust settings if needed, then click <strong>Scan Now</strong>.', 'info');
    setTimeout(() => { cleanupContent(); setupButtons(); }, 500);
    setTimeout(() => { cleanupContent(); setupButtons(); }, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
