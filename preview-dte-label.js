// Improves the DTE Window field display without changing the scanner value contract.
(function(){
  function findDteField(){
    return document.getElementById('dteWindow') || document.getElementById('dteRange') || document.getElementById('dte');
  }

  function applyDteDisplay(){
    var field = findDteField();
    if(!field) return;

    var value = field.value || '15-45';
    var match = String(value).match(/(\d+)\s*-\s*(\d+)/);
    var raw = match ? (match[1] + '-' + match[2]) : '15-45';

    if(field.tagName === 'SELECT'){
      var found = false;
      Array.prototype.forEach.call(field.options, function(o){
        if(o.value === raw){
          o.textContent = match ? (match[1] + ' - ' + match[2] + ' Days') : '15 - 45 Days';
          found = true;
        }
      });
      if(!found){
        field.innerHTML = '';
        var opt = document.createElement('option');
        opt.value = raw;
        opt.textContent = match ? (match[1] + ' - ' + match[2] + ' Days') : '15 - 45 Days';
        field.appendChild(opt);
      }
      field.value = raw;
      return;
    }

    var select = document.createElement('select');
    select.id = field.id;
    select.name = field.name || field.id;
    select.className = field.className;
    select.setAttribute('data-raw-value', raw);

    var opt = document.createElement('option');
    opt.value = raw;
    opt.textContent = match ? (match[1] + ' - ' + match[2] + ' Days') : '15 - 45 Days';
    select.appendChild(opt);

    field.parentNode.replaceChild(select, field);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyDteDisplay);
  else applyDteDisplay();
  setTimeout(applyDteDisplay, 1000);
})();
