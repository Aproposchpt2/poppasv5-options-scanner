// POPPA'S preview timed rescan controller.
// Single-CTA model: auto-load on page open, one Re-scan CTA for current Band Intake settings.
// Adds adaptive pull-size calibration so the page can determine a stable record batch size.
(function(){
  var LIMIT = 25;
  var PULL_STEPS = [25,50,100,250,500];
  var calibrated = false;
  var pageOffset = 0;
  var nextOffset = null;
  var totalRows = 0;
  var pollTimer = null;

  function el(id){ return document.getElementById(id); }
  function say(text, kind){ if(typeof msg === 'function') msg(text, kind || 'warn'); else console.log(text); }
  function setText(id, text){ var x=el(id); if(x) x.textContent=text; }
  function setHTML(id, html){ var x=el(id); if(x) x.innerHTML=html; }
  function clock(sec){ var m=Math.floor(sec/60); var s=String(sec%60).padStart(2,'0'); return m + ':' + s; }

  function hideExtraControls(){
    var run = el('runScanBtn');
    var reset = el('resetBtn');
    var load = el('loadNextBtn');
    if(run) run.style.display = 'none';
    if(reset) reset.style.display = 'none';
    if(load) load.style.display = 'none';
    var rescan = el('rescanBtn');
    if(rescan){
      rescan.textContent = '↻ Re-scan Live Data';
      rescan.classList.add('primary');
      rescan.style.display = '';
    }
  }

  function setNextButton(){
    var b = el('loadNextBtn');
    if(!b){
      var reset = el('resetBtn');
      if(reset){
        b = document.createElement('button');
        b.className = 'btn secondary';
        b.id = 'loadNextBtn';
        reset.insertAdjacentElement('afterend', b);
      }
    }
    if(!b) return;
    var has = nextOffset !== null && nextOffset !== undefined;
    b.disabled = !has;
    b.textContent = has ? ('Load Next ' + LIMIT + ' Records') : 'All Records Loaded';
    b.onclick = function(){ if(has){ pageOffset = nextOffset; loadLivePage(true); } };
    b.style.display = 'none';
  }

  async function fetchWithTimeout(url, ms){
    var controller = new AbortController();
    var timeout = setTimeout(function(){ controller.abort(); }, ms || 9000);
    try{
      var res = await fetch(url, { cache:'no-store', headers:{ accept:'application/json' }, signal: controller.signal });
      return await res.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async function calibratePullSize(){
    if(calibrated) return LIMIT;
    var best = 25;
    say('Calibrating stable live pull size… starting at 25 records.', 'warn');
    for(var i=0;i<PULL_STEPS.length;i++){
      var size = PULL_STEPS[i];
      try{
        setHTML('explanation','Testing live pull size: <strong>' + size + '</strong> records. The scanner will use the largest stable size for this session.');
        var test = await fetchWithTimeout('/.netlify/functions/scan-results-preview?limit=' + size + '&offset=0&_ts=' + Date.now(), 9000);
        if(test && Array.isArray(test.results) && test.results.length){
          best = size;
          say('Pull size ' + size + ' passed.', 'ok');
        } else {
          break;
        }
      }catch(e){
        console.warn('Pull size failed:', size, e);
        break;
      }
    }
    LIMIT = best;
    calibrated = true;
    say('Stable pull size selected: ' + LIMIT + ' records per pull.', 'ok');
    setNextButton();
    return LIMIT;
  }

  async function loadLivePage(append){
    if(!append) await calibratePullSize();
    var url = '/.netlify/functions/scan-results-preview?limit=' + LIMIT + '&offset=' + pageOffset + '&_ts=' + Date.now();
    var data = await fetchWithTimeout(url, 12000);
    if(!data || !Array.isArray(data.results) || !data.results.length) throw new Error('No live rows returned');

    var mapper = (typeof map === 'function') ? map : function(r){ return r; };
    var incoming = data.results.map(mapper);
    if(append) allRows = allRows.concat(incoming); else allRows = incoming;
    totalRows = data.total || data.matched || allRows.length;
    nextOffset = (data.nextOffset !== undefined && data.nextOffset !== null) ? data.nextOffset : (data.hasMore ? pageOffset + LIMIT : null);

    setText('universeCount', data.universeCount || data.scanned || '—');
    setText('pulledCount', data.scanned || '—');
    setText('condorCount', data.withCondor || data.total || allRows.length);
    setText('activeMatches', allRows.length.toLocaleString());
    setText('truthDataMode', data.filterMode || 'Live preview slice');
    setText('truthLastScan', data.generatedAt ? new Date(data.generatedAt).toLocaleString() : '—');
    setText('truthUniverse', (data.universeCount || '—') + ' symbols');
    setText('truthBuild', data.building ? 'Finalizing with live rows' : 'Ready');
    setText('scanMode', data.building ? 'Live board finalizing' : 'Live board ready');
    setHTML('explanation','Stable pull size: <strong>' + LIMIT + '</strong> records. Showing results from the current Band Intake values. Loaded <strong>' + allRows.length.toLocaleString() + '</strong> of <strong>' + totalRows.toLocaleString() + '</strong> live records before display filtering. ' + (data.userMessage || ''));

    setNextButton();
    if(typeof apply === 'function') apply();
    if(typeof showTicket === 'function' && typeof lastRows !== 'undefined' && lastRows.length) showTicket(0);
    say('Live board loaded using current Band Intake values. Pull size: ' + LIMIT + '.', 'ok');
    hideExtraControls();
    return data;
  }

  async function runCurrentBandScan(){
    var rescan = el('rescanBtn');
    if(rescan) rescan.disabled = true;
    pageOffset = 0; nextOffset = null; allRows = []; setNextButton();
    say('Checking latest live board using current Band Intake values…', 'warn');
    try { await loadLivePage(false); }
    catch(e){
      console.warn(e);
      say('Live board is not ready yet. Starting timed scan. Typical scan time is about 5 minutes.', 'warn');
      await startTimedRescan();
      return;
    }
    if(rescan){ rescan.disabled = false; rescan.textContent = '↻ Re-scan Live Data'; }
    hideExtraControls();
  }

  async function startTimedRescan(){
    var b = el('rescanBtn');
    hideExtraControls();
    if(b){ b.disabled = true; b.textContent = 'Scanning… ~5 min'; }
    pageOffset = 0; nextOffset = null; allRows = []; calibrated = false; LIMIT = 25; setNextButton();
    say('Fresh scan in progress. Pulling delayed/EOD option chains. This can take approximately 5 minutes.', 'warn');
    setText('scanMode','Fresh scan running…');
    setHTML('explanation','⏳ <strong>Fresh scan in progress:</strong> pulling delayed/EOD option chains. This can take approximately 5 minutes. The completed board will be filtered using the current Band Intake values.');
    var body = el('resultsBody');
    if(body) body.innerHTML = '<tr><td colspan="99" class="empty">Fresh scan in progress. Waiting for live scan board…</td></tr>';

    try { await fetch('/.netlify/functions/scan-build-background', { method:'POST' }); } catch(e){ console.warn(e); }

    var elapsed = 0;
    if(pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(async function(){
      elapsed += 10;
      var t = clock(elapsed);
      if(b) b.textContent = 'Scanning… ' + t;
      setHTML('explanation','⏳ <strong>Fresh scan in progress:</strong> elapsed ' + t + '. Waiting for the live scan board. Typical scan time is about 5 minutes.');
      try {
        var status = await (await fetch('/.netlify/functions/force-eod-pull?status=1&_ts=' + Date.now(), { cache:'no-store' })).json();
        if(status && status.latestResults > 0){
          await loadLivePage(false);
          clearInterval(pollTimer); pollTimer = null;
          if(b){ b.disabled = false; b.textContent = '↻ Re-scan Live Data'; }
          hideExtraControls();
        }
      } catch(e){ console.warn('Still waiting for scan board', e); }

      if(elapsed >= 360){
        clearInterval(pollTimer); pollTimer = null;
        if(b){ b.disabled = false; b.textContent = '↻ Re-scan Live Data'; }
        say('Scan is still building. Please wait a little longer, then press Re-scan Live Data again.', 'warn');
        hideExtraControls();
      }
    }, 10000);
  }

  function boot(){
    hideExtraControls();
    var rescan = el('rescanBtn');
    if(rescan) rescan.onclick = runCurrentBandScan;
    setNextButton();
    setHTML('explanation','The scanner will automatically load using the default Band Intake values. After changing any Band Intake field, press <strong>Re-scan Live Data</strong> to refresh the displayed candidates.');
    say('Loading scanner using default Band Intake values…', 'warn');
    setTimeout(runCurrentBandScan, 300);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 800);
})();
