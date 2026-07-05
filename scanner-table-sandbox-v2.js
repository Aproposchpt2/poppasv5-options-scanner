// POPPA'S Scanner Table Preview — public-safe recovery overlay.
// Purpose: preserve the uploaded table preview UX while preventing the prior external controller from replacing it.
(function () {
  'use strict';

  let userStartedScan = false;
  const $ = id => document.getElementById(id);

  function sanitize(text) {
    return String(text || '')
      .replace(/Supabase/gi, 'market data')
      .replace(/Netlify/gi, 'scanner service')
      .replace(/Postgres/gi, 'processing layer')
      .replace(/REST/gi, 'data')
      .replace(/scan-results-preview/gi, 'scanner results')
      .replace(/scan-results/gi, 'scanner results')
      .replace(/scan-build-background/gi, 'scanner refresh')
      .replace(/v4-live-supabase-0-45-prob80/gi, 'approved strategy filters');
  }

  function injectStyles() {
    if ($('poppas-table-recovery-style')) return;
    const style = document.createElement('style');
    style.id = 'poppas-table-recovery-style';
    style.textContent = `
      #results, #results .wide, #results .table-wrap, #results table, #resultsBody {
        display: revert !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
      #results .table-wrap { display: block !important; overflow: auto !important; }
      #loadNextBtn, button#loadNextBtn, a#loadNextBtn { display:none!important; visibility:hidden!important; }
      #runScanBtn, #rescanBtn {
        display: inline-flex !important;
        visibility: visible !important;
        opacity: 1 !important;
        align-items: center;
        justify-content: center;
        transition: transform .16s ease, box-shadow .16s ease, background .16s ease, border-color .16s ease;
      }
      #runScanBtn:hover {
        transform: translateY(-2px);
        box-shadow: 0 0 26px rgba(62,227,145,.42), 0 12px 34px rgba(0,0,0,.32);
        background: linear-gradient(135deg,#ffffff,#3ee391) !important;
      }
      #runScanBtn:active { transform: translateY(1px) scale(.98); box-shadow: 0 0 12px rgba(62,227,145,.55); }
      #rescanBtn:hover { transform: translateY(-2px); border-color: rgba(62,227,145,.72) !important; box-shadow: 0 0 18px rgba(62,227,145,.18); }
      #scanProgress {
        border-left: 5px solid var(--green) !important;
        border-color: rgba(62,227,145,.42) !important;
        background: linear-gradient(90deg, rgba(62,227,145,.16), rgba(62,227,145,.05)) !important;
        color: var(--green) !important;
        font-weight: 400 !important;
        font-style: italic !important;
        text-shadow: 0 0 18px rgba(62,227,145,.24);
      }
      #scanProgress strong, #scanProgress .ok, #scanProgress span { color: var(--green) !important; font-weight: 400 !important; font-style: italic !important; }
      #ticketBox .viz, #ticketBox .bar, #ticketBox .gauge, #ticketBox .fill { visibility: visible !important; opacity: 1 !important; }
      .poppas-footer-brand{width:100%;text-align:center;font-family:var(--disp);font-size:2.25rem;line-height:1.15;color:#fff;font-weight:800;letter-spacing:.06em;text-transform:uppercase}.poppas-footer-brand span{display:block;margin-top:8px;font-family:var(--body);font-size:1rem;letter-spacing:.22em;color:var(--gold);font-weight:900}
    `;
    document.head.appendChild(style);
  }

  function greenMessage(message) {
    const box = $('scanProgress');
    if (!box) return;
    box.innerHTML = '<span class="ok">' + sanitize(message) + '</span>';
  }

  function restoreFaqAndFooter() {
    const faq = $('faq');
    if (faq) {
      faq.innerHTML = '<div class="container panel"><p class="eyebrow">FAQ</p><h2 class="title">Scanner questions</h2><div class="cards5"><div class="card"><h3>Where is the scanner data sourced from?</h3><p>Market data is sourced from professional market-data feeds and processed through POPPA\'S Strategy OS for educational Iron Condor candidate analysis.</p></div><div class="card"><h3>What does Scan Now do?</h3><p>It searches for qualifying educational candidates using the current scanner settings.</p></div><div class="card"><h3>What does Scan For More Records do?</h3><p>It expands the visible candidate set for additional educational review.</p></div><div class="card"><h3>Are these trade recommendations?</h3><p>No. Rows are educational candidates only. Pricing, liquidity, expiration, earnings, and risk must be verified independently.</p></div><div class="card"><h3>What is ROC After Cost?</h3><p>It estimates return after standard commission and fee assumptions are included.</p></div></div></div>';
    }
    document.querySelectorAll('.foot,footer').forEach(f => {
      f.innerHTML = '<div class="poppas-footer-brand">POPPA\'S STRATEGY OS<span>ENGINEERED BY INNOVATIVE INTELLIGENCE</span></div>';
      f.style.justifyContent = 'center';
      f.style.textAlign = 'center';
    });
  }

  function clearAutoRenderedBoard() {
    if (userStartedScan) return;
    const body = $('resultsBody');
    if (body) body.innerHTML = '<tr><td colspan="17" class="empty">No scan has been run yet. Adjust settings, then click Scan Now.</td></tr>';
    if ($('candidateCount')) $('candidateCount').textContent = '—';
    if ($('scanMode')) $('scanMode').textContent = 'Waiting';
    if ($('scanStamp')) $('scanStamp').textContent = '—';
    if ($('diagMatches')) $('diagMatches').textContent = '—';
    if ($('diagDisplayed')) $('diagDisplayed').textContent = '—';
    if ($('ticketBox')) $('ticketBox').innerHTML = '<p class="note">Click Scan Now, then select a candidate.</p>';
    greenMessage('Ready. Adjust settings if needed, then click Scan Now.');
  }

  function sanitizeVisibleText() {
    const ids = ['explanation', 'truthDataMode', 'scanMode'];
    ids.forEach(id => { const el = $(id); if (el) el.textContent = sanitize(el.textContent); });
    const progress = $('scanProgress');
    if (progress) progress.innerHTML = sanitize(progress.innerHTML);
  }

  function hookOriginalFunctions() {
    const originalMsg = window.msg;
    if (typeof originalMsg === 'function') {
      window.msg = function (text, cls) { originalMsg.call(window, sanitize(text), cls || 'ok'); greenMessage(sanitize(text)); };
    }

    const originalRunScan = window.runScan;
    if (typeof originalRunScan === 'function') {
      window.runScan = async function () {
        userStartedScan = true;
        greenMessage('Scanning: searching for qualifying Iron Condor candidates…');
        const result = await originalRunScan.apply(window, arguments);
        sanitizeVisibleText();
        const displayed = (($('candidateCount') || {}).textContent || '').trim();
        if (displayed && displayed !== '0' && displayed !== '—') greenMessage('Scan complete. Candidate results are ready for review. Select a row to update the ticket and green-box graph.');
        return result;
      };
    }

    const originalRescan = window.rescan;
    if (typeof originalRescan === 'function') {
      window.rescan = async function () { userStartedScan = true; greenMessage('Scanning: searching for additional qualifying market candidates…'); const result = await originalRescan.apply(window, arguments); sanitizeVisibleText(); return result; };
    }

    const run = $('runScanBtn');
    if (run && typeof window.runScan === 'function') { run.textContent = 'Scan Now'; run.onclick = event => { event.preventDefault(); window.runScan(); }; }
    const rescan = $('rescanBtn');
    if (rescan && typeof window.rescan === 'function') { rescan.textContent = 'Scan For More Records'; rescan.onclick = event => { event.preventDefault(); window.rescan(); }; }
  }

  function hookControlsManualOnly() {
    ['idxSel','spreadWidth','dteWindow','excludeEarnings','rankBy','rocMin','rocMax','minProb','ivMin','minOI','minShortOI','maxSpread','maxResults','ivStatusSel','emStatusSel'].forEach(id => {
      const el = $(id); if (!el) return;
      el.oninput = () => greenMessage('Scanner settings changed. Click Scan Now to refresh your results.');
      el.onchange = () => greenMessage('Scanner settings changed. Click Scan Now to refresh your results.');
    });
  }

  function init() {
    injectStyles();
    restoreFaqAndFooter();
    hookOriginalFunctions();
    hookControlsManualOnly();
    clearAutoRenderedBoard();
    sanitizeVisibleText();
    setTimeout(clearAutoRenderedBoard, 600);
    setTimeout(clearAutoRenderedBoard, 1800);
    setTimeout(restoreFaqAndFooter, 2000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
