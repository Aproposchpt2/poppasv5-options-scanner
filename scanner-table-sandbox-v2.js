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
      #results .table-wrap {
        display: block !important;
        overflow: auto !important;
      }
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
      #runScanBtn:active {
        transform: translateY(1px) scale(.98);
        box-shadow: 0 0 12px rgba(62,227,145,.55);
      }
      #rescanBtn:hover {
        transform: translateY(-2px);
        border-color: rgba(62,227,145,.72) !important;
        box-shadow: 0 0 18px rgba(62,227,145,.18);
      }
      #scanProgress {
        border-left: 5px solid var(--green) !important;
        border-color: rgba(62,227,145,.42) !important;
        background: linear-gradient(90deg, rgba(62,227,145,.16), rgba(62,227,145,.05)) !important;
        color: var(--green) !important;
        font-weight: 950 !important;
        text-shadow: 0 0 18px rgba(62,227,145,.24);
      }
      #scanProgress strong, #scanProgress .ok, #scanProgress span {
        color: var(--green) !important;
      }
      #ticketBox .viz, #ticketBox .bar, #ticketBox .gauge, #ticketBox .fill {
        visibility: visible !important;
        opacity: 1 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function greenMessage(message) {
    const box = $('scanProgress');
    if (!box) return;
    box.innerHTML = '<strong>Status:</strong> <span class="ok">' + sanitize(message) + '</span>';
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
    ids.forEach(id => {
      const el = $(id);
      if (el) el.textContent = sanitize(el.textContent);
    });
    const progress = $('scanProgress');
    if (progress) progress.innerHTML = sanitize(progress.innerHTML);
  }

  function hookOriginalFunctions() {
    const originalMsg = window.msg;
    if (typeof originalMsg === 'function') {
      window.msg = function (text, cls) {
        originalMsg.call(window, sanitize(text), cls || 'ok');
        greenMessage(sanitize(text));
      };
    }

    const originalRunScan = window.runScan;
    if (typeof originalRunScan === 'function') {
      window.runScan = async function () {
        userStartedScan = true;
        greenMessage('Scanning: searching for qualifying Iron Condor candidates…');
        const result = await originalRunScan.apply(window, arguments);
        sanitizeVisibleText();
        greenMessage('Scan complete. Candidate results are ready for review. Select a row to update the ticket and green-box graph.');
        return result;
      };
    }

    const originalRescan = window.rescan;
    if (typeof originalRescan === 'function') {
      window.rescan = async function () {
        userStartedScan = true;
        greenMessage('Scanning: searching for additional qualifying market candidates…');
        const result = await originalRescan.apply(window, arguments);
        sanitizeVisibleText();
        return result;
      };
    }

    const run = $('runScanBtn');
    if (run && typeof window.runScan === 'function') {
      run.textContent = 'Scan Now';
      run.onclick = function (event) {
        event.preventDefault();
        window.runScan();
      };
    }

    const rescan = $('rescanBtn');
    if (rescan && typeof window.rescan === 'function') {
      rescan.textContent = 'Scan For More Records';
      rescan.onclick = function (event) {
        event.preventDefault();
        window.rescan();
      };
    }
  }

  function hookControlsManualOnly() {
    ['idxSel','spreadWidth','dteWindow','excludeEarnings','rankBy','rocMin','rocMax','minProb','ivMin','minOI','minShortOI','maxSpread','maxResults','ivStatusSel','emStatusSel'].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.oninput = function () {
        greenMessage('Scanner settings changed. Click Scan Now to refresh your results.');
      };
      el.onchange = function () {
        greenMessage('Scanner settings changed. Click Scan Now to refresh your results.');
      };
    });
  }

  function init() {
    injectStyles();
    hookOriginalFunctions();
    hookControlsManualOnly();
    clearAutoRenderedBoard();
    sanitizeVisibleText();

    // The source preview had an inline auto-run before this overlay loads.
    // These delayed resets restore the intended manual CTA workflow without changing other page sections.
    setTimeout(clearAutoRenderedBoard, 600);
    setTimeout(clearAutoRenderedBoard, 1800);
    setTimeout(clearAutoRenderedBoard, 3600);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
