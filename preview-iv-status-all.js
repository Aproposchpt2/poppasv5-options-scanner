// Adds an All option to the IV Status dropdown on the scanner preview page.
// Also applies safe display-only corrections without changing page structure or scanner logic.
(function(){
  function findIvStatusSelect(){
    var ids = ['ivStatus','ivStatusFilter','ivStatusSel','ivFilter'];
    for(var i=0;i<ids.length;i++){
      var x=document.getElementById(ids[i]);
      if(x && x.tagName === 'SELECT') return x;
    }
    var labels = Array.prototype.slice.call(document.querySelectorAll('label'));
    for(var j=0;j<labels.length;j++){
      var text=(labels[j].textContent||'').toLowerCase();
      if(text.indexOf('iv status') !== -1){
        var s=labels[j].querySelector('select');
        if(s) return s;
      }
    }
    return null;
  }

  function ensureAllOption(){
    var select = findIvStatusSelect();
    if(!select) return;
    var hasAll = Array.prototype.some.call(select.options,function(o){ return String(o.value).toLowerCase() === 'all'; });
    if(!hasAll){
      var opt = document.createElement('option');
      opt.value = 'all';
      opt.textContent = 'All';
      select.insertBefore(opt, select.firstChild);
    }
    select.value = 'all';
    Array.prototype.forEach.call(select.options,function(o){ o.selected = String(o.value).toLowerCase() === 'all'; });
  }

  function replaceTextNodes(){
    var replacements = {
      'Live board unavailable; sample preview rendered.': 'Waiting to start scanning',
      'Live rows unavailable. Showing sample preview rows.': 'Waiting to start scanning. Press Start Scanning when ready.',
      'Showing sample preview rows.': 'Waiting to start scanning. Press Start Scanning when ready.'
    };
    try{
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      var node;
      while((node = walker.nextNode())){
        var value = node.nodeValue || '';
        Object.keys(replacements).forEach(function(from){
          if(value.indexOf(from) !== -1){
            value = value.split(from).join(replacements[from]);
          }
        });
        node.nodeValue = value;
      }
    }catch(e){}
  }

  function relabelAnchorCall(){
    Array.prototype.forEach.call(document.querySelectorAll('.ticket-math .tm span, #ticketBox .tm span'), function(node){
      var value = (node.textContent || '').trim().toLowerCase();
      if(value === 'anchor p(otm)') node.textContent = 'ANCHOR P(OTM) CALL';
    });
  }

  function applyDisplayCorrections(){
    replaceTextNodes();
    relabelAnchorCall();
  }

  function run(){
    ensureAllOption();
    applyDisplayCorrections();
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }

  setTimeout(run, 250);
  setTimeout(run, 1000);
  setTimeout(run, 2500);

  if(window.MutationObserver){
    new MutationObserver(applyDisplayCorrections).observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
})();
