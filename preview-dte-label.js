// DTE window display helper — locks the current value as the sole visible option.
(function(){
  function findDteField(){return document.getElementById('dteWindow')||document.getElementById('dteRange')||document.getElementById('dte');}
  function applyDteDisplay(){
    var field=findDteField();if(!field)return;
    var match=String(field.value||'0-45').match(/(\d+)\s*-\s*(\d+)/),raw=match?(match[1]+'-'+match[2]):'0-45',label=match?(match[1]+' - '+match[2]+' Days'):'0 - 45 Days';
    if(field.tagName==='SELECT'){
      var found=false;Array.prototype.forEach.call(field.options,function(o){if(o.value===raw){o.textContent=label;found=true;}});
      if(!found){field.innerHTML='';var opt=document.createElement('option');opt.value=raw;opt.textContent=label;field.appendChild(opt);}
      field.value=raw;return;
    }
    var select=document.createElement('select');select.id=field.id;select.name=field.name||field.id;select.className=field.className;select.setAttribute('data-raw-value',raw);
    var option=document.createElement('option');option.value=raw;option.textContent=label;select.appendChild(option);field.parentNode.replaceChild(select,field);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyDteDisplay);else applyDteDisplay();setTimeout(applyDteDisplay,1000);
})();

// Condor ticket enhancement — improved visualization, separate anchor probabilities, symbol links.
(function(){
  var selected=0,started=false;
  function n(v){if(v===null||v===undefined||v==='')return null;var x=Number(String(v).replace(/[^0-9.\-]/g,''));if(!Number.isFinite(x))return null;return x>0&&x<=1?x*100:x;}
  function first(o,a){if(!o)return null;for(var i=0;i<a.length;i++){var x=n(o[a[i]]);if(x!==null)return x;}return null;}
  function money(t){var x=Number(String(t||'').replace(/[^0-9.\-]/g,''));return Number.isFinite(x)?x:null;}
  function strike(t){var m=String(t||'').match(/([0-9]+(?:\.[0-9]+)?)\s*[PC]\b/i);return m?Number(m[1]):null;}
  function f(v,d){if(v===null||v===undefined||v==='')return '—';var x=Number(v);return Number.isFinite(x)?x.toFixed(d===undefined?2:d):'—';}
  function pct(v){var x=n(v);return x===null?'—':f(x,1)+'%';}
  function clamp(v){var x=Number(v);return Number.isFinite(x)?Math.max(0,Math.min(100,x)):0;}
  function pos(v,min,max){var x=Number(v);return!Number.isFinite(x)||max<=min?50:Math.max(2,Math.min(98,((x-min)/(max-min))*100));}
  function row(){var rows=[].slice.call(document.querySelectorAll('#resultsBody tr'));return rows[selected]||document.querySelector('#resultsBody tr.row-active')||rows[0]||null;}
  function cell(r,i){return r&&r.cells&&r.cells[i]?r.cells[i].textContent.trim():'';}
  function metric(label){var cards=[].slice.call(document.querySelectorAll('#ticketBox .tm')),want=String(label).toLowerCase();for(var i=0;i<cards.length;i++){var s=cards[i].querySelector('span');if(s&&s.textContent.trim().toLowerCase()===want){var b=cards[i].querySelector('strong');return b?b.textContent.trim():cards[i].textContent.trim();}}return '';}
  function upsert(label,value,upper){var box=document.querySelector('#ticketBox .ticket-math');if(!box)return;var cards=[].slice.call(box.querySelectorAll('.tm')),want=String(label).toLowerCase(),card=null;for(var i=0;i<cards.length;i++){var s=cards[i].querySelector('span');if(s&&s.textContent.trim().toLowerCase()===want){card=cards[i];break;}}if(!card){card=document.createElement('div');card.className='tm';card.innerHTML='<span></span><strong></strong>';box.appendChild(card);}card.querySelector('span').textContent=upper?String(label).toUpperCase():label;card.querySelector('strong').textContent=value||'—';}
  function rename(from,to){[].forEach.call(document.querySelectorAll('#ticketBox .tm span'),function(s){if(s.textContent.trim().toLowerCase()===String(from).toLowerCase())s.textContent=to;});}

  function styles(){
    if(document.getElementById('poppas-viz-v2'))return;
    var s=document.createElement('style');s.id='poppas-viz-v2';
    s.textContent=[
      /* Symbol links */
      '.candidate-symbol-link{display:inline-flex;color:var(--cyan);font-weight:900;text-decoration:underline;text-underline-offset:4px;border:1px solid rgba(123,220,255,.34);border-radius:999px;padding:4px 10px;background:rgba(123,220,255,.08)}',
      '.candidate-symbol-link:hover{background:rgba(123,220,255,.18);outline:2px solid rgba(123,220,255,.55);outline-offset:2px}',
      /* Main card */
      '.condor-viz{border:1px solid rgba(213,174,85,.28);border-radius:18px;padding:20px 22px;margin-top:16px;background:linear-gradient(160deg,rgba(7,19,38,.97),rgba(2,8,22,1));box-shadow:0 24px 70px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.05);overflow:hidden;position:relative}',
      /* Header */
      '.cv-hd{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:20px}',
      '.cv-ey{font-size:.6rem;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);font-weight:900;margin-bottom:5px}',
      '.cv-ti{font-family:var(--disp);font-size:1.45rem;color:#fff;font-weight:600;line-height:1.1}',
      '.cv-ti em{font-family:var(--body);font-style:normal;font-size:.78rem;color:var(--muted);font-weight:400;margin-left:6px}',
      '.cv-bd{display:flex;gap:7px;flex-wrap:wrap;align-items:flex-start}',
      '.cv-b{font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;font-weight:900;border-radius:999px;padding:5px 11px;border:1px solid;white-space:nowrap}',
      '.cv-bg{color:var(--green);border-color:rgba(62,227,145,.4);background:rgba(62,227,145,.1)}',
      '.cv-bc{color:var(--cyan);border-color:rgba(123,220,255,.4);background:rgba(123,220,255,.1)}',
      '.cv-ba{color:var(--amber);border-color:rgba(242,180,71,.4);background:rgba(242,180,71,.1)}',
      /* Track wrapper with room for floating labels */
      '.cv-tw{position:relative;padding:34px 0 50px;margin:0 2px}',
      /* Track bar */
      '.cv-tr{position:relative;height:68px;border-radius:10px;overflow:hidden;border:1px solid rgba(191,214,255,.16);background:rgba(0,0,0,.4);box-shadow:inset 0 2px 18px rgba(0,0,0,.5)}',
      '.cv-z{position:absolute;top:0;bottom:0;display:flex;align-items:flex-end;padding-bottom:7px}',
      '.cv-zp{background:linear-gradient(90deg,rgba(242,180,71,.12),rgba(242,180,71,.42));border-right:1px solid rgba(242,180,71,.25)}',
      '.cv-zc{background:linear-gradient(270deg,rgba(242,180,71,.12),rgba(242,180,71,.42));border-left:1px solid rgba(242,180,71,.25)}',
      '.cv-zf{background:linear-gradient(180deg,rgba(62,227,145,.55),rgba(62,227,145,.32));box-shadow:0 0 32px rgba(62,227,145,.18),inset 0 0 16px rgba(62,227,145,.06);border-left:2px solid rgba(62,227,145,.7);border-right:2px solid rgba(62,227,145,.7);justify-content:center}',
      '.cv-zt{font-size:.5rem;letter-spacing:.14em;text-transform:uppercase;font-weight:900;pointer-events:none;white-space:nowrap}',
      '.cv-zp .cv-zt,.cv-zc .cv-zt{color:rgba(242,180,71,.65)}',
      '.cv-zf .cv-zt{color:rgba(62,227,145,.8)}',
      /* Expected move band */
      '.cv-em{position:absolute;top:0;bottom:0;border-left:1px dashed rgba(123,220,255,.4);border-right:1px dashed rgba(123,220,255,.4);background:rgba(123,220,255,.03);pointer-events:none}',
      /* Markers */
      '.cv-mk{position:absolute;top:-3px;bottom:-3px;border-radius:2px;pointer-events:none}',
      '.cv-ms{width:3px;background:#fff;box-shadow:0 0 0 1px rgba(123,220,255,.7),0 0 16px rgba(123,220,255,.8),0 0 36px rgba(123,220,255,.3);z-index:4}',
      '.cv-ma{width:2px;background:var(--gold);box-shadow:0 0 10px rgba(213,174,85,.8);z-index:3}',
      '.cv-me{width:1px;background:rgba(123,220,255,.5);box-shadow:0 0 5px rgba(123,220,255,.3);z-index:2}',
      /* Labels above track */
      '.cv-la{position:absolute;transform:translateX(-50%);top:0;text-align:center;pointer-events:none}',
      '.cv-ac{background:rgba(5,14,30,.97);border:1px solid rgba(213,174,85,.5);border-radius:9px;padding:5px 10px;display:inline-block;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,.5)}',
      '.cv-ac strong{display:block;color:var(--gold);font-size:.84rem;font-weight:700;letter-spacing:.02em}',
      '.cv-ac small{display:block;color:var(--muted);font-size:.54rem;letter-spacing:.12em;text-transform:uppercase;margin-top:1px}',
      /* Labels below track */
      '.cv-lb{position:absolute;transform:translateX(-50%);text-align:center;pointer-events:none}',
      '.cv-sc{background:rgba(5,14,30,.97);border:1px solid rgba(123,220,255,.45);border-radius:9px;padding:5px 10px;display:inline-block;white-space:nowrap;box-shadow:0 4px 16px rgba(0,0,0,.5)}',
      '.cv-sc strong{display:block;color:#fff;font-size:.84rem;font-weight:700}',
      '.cv-sc small{display:block;color:var(--cyan);font-size:.54rem;letter-spacing:.12em;text-transform:uppercase;margin-top:1px}',
      '.cv-el{color:rgba(123,220,255,.6);font-size:.6rem;letter-spacing:.06em;line-height:1.4;white-space:nowrap}',
      /* Stats strip */
      '.cv-ss{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:6px 0 14px}',
      '.cv-st{border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:rgba(255,255,255,.04)}',
      '.cv-sl{font-size:.58rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:5px}',
      '.cv-sv{font-size:1rem;color:#fff;font-weight:700}',
      /* Probability cards */
      '.cv-pr{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:2px}',
      '.cv-pc{border:1px solid var(--line);border-radius:14px;padding:14px 16px;background:rgba(255,255,255,.04);display:flex;align-items:center;gap:14px}',
      '.cv-pn{font-family:var(--disp);font-size:2.3rem;font-weight:600;line-height:1;flex-shrink:0;min-width:72px}',
      '.cv-pn.ok{color:var(--green)}.cv-pn.lo{color:var(--amber)}',
      '.cv-pd{flex:1;min-width:0}',
      '.cv-pg{font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-bottom:4px}',
      '.cv-pk{color:#fff;font-weight:700;font-size:.88rem}',
      '.cv-pt{height:6px;background:rgba(255,255,255,.14);border-radius:999px;margin-top:9px;position:relative}',
      '.cv-pf{height:100%;border-radius:999px;transition:.4s}.cv-pf.ok{background:var(--green)}.cv-pf.lo{background:var(--amber)}',
      '.cv-px{position:absolute;top:-3px;width:2px;height:12px;background:rgba(255,255,255,.5);border-radius:1px;left:90%}',
      /* Responsive */
      '@media(max-width:760px){.cv-ss{grid-template-columns:1fr 1fr}.cv-pr{grid-template-columns:1fr}.cv-pn{font-size:1.8rem}}'
    ].join('');
    document.head.appendChild(s);
  }

  function patchMap(){if(typeof window.map!=='function'||window.map.__poppasAnchors)return;var old=window.map;window.map=function(rec){var m=old.call(this,rec||{}),bind=first(rec,['prob','probOtm','anchorProb','anchorPOTM','anchorPotm','bindingAnchorProb','bindingAnchorPOTM']);if(bind===null)bind=n(m&&m.prob);var put=first(rec,['putProb','putProbOtm','putAnchorProb','putAnchorPOTM','putAnchorPotm','putAnchorProbability','putAnchorProbabilityOtm','shortPutProb','shortPutPOTM','shortPutProbOtm']);var call=first(rec,['callProb','callProbOtm','callAnchorProb','callAnchorPOTM','callAnchorPotm','callAnchorProbability','callAnchorProbabilityOtm','shortCallProb','shortCallPOTM','shortCallProbOtm']);if(put===null)put=bind;if(call===null)call=bind;if(m){m.putProb=put;m.callProb=call;m.putAnchorProb=put;m.callAnchorProb=call;}return m;};window.map.__poppasAnchors=true;}

  function data(){
    var r=row(),
        sp=document.querySelector('#ticketBox .leg:nth-child(1) strong'),
        bp=document.querySelector('#ticketBox .leg:nth-child(2) strong'),
        sc=document.querySelector('#ticketBox .leg:nth-child(3) strong'),
        bc=document.querySelector('#ticketBox .leg:nth-child(4) strong'),
        sym=(cell(r,1)||(sp?sp.textContent:'')||'Selected').replace(/[^A-Z0-9.\-]/gi,'').replace(/[0-9].*$/,'')||'Selected',
        spot=money(cell(r,3)),move=money(cell(r,7)),fallback=n(cell(r,11)),
        pp=n(metric('Put Anchor P(OTM)')),cp=n(metric('Call Anchor P(OTM)'));
    return{
      r:r,sym:sym,spot:spot,move:move,
      sp:strike(sp?sp.textContent:''),bp:strike(bp?bp.textContent:''),
      sc:strike(sc?sc.textContent:''),bc:strike(bc?bc.textContent:''),
      pp:pp===null?fallback:pp,cp:cp===null?fallback:cp,
      em:cell(r,8)||metric('Expected Range'),
      iv:cell(r,9),review:cell(r,16),
      dte:cell(r,4),credit:cell(r,12),roc:cell(r,14)
    };
  }

  function graph(){
    var d=data(),old=document.querySelector('#ticketBox .viz,#ticketBox .condor-viz');
    if(!old)return;
    var vals=[d.bp,d.sp,d.sc,d.bc,d.spot].filter(function(x){return Number.isFinite(x);});
    if(d.move&&d.spot){vals.push(d.spot-d.move,d.spot+d.move);}
    if(!vals.length)return;
    var mn=Math.min.apply(Math,vals),mx=Math.max.apply(Math,vals),pad=Math.max((mx-mn)*.14,2);
    mn-=pad;mx+=pad;
    var pp=pos(d.sp,mn,mx),cp=pos(d.sc,mn,mx),sp=pos(d.spot,mn,mx);
    var low=d.move&&d.spot?d.spot-d.move:null,high=d.move&&d.spot?d.spot+d.move:null;
    var lp=low!==null?pos(low,mn,mx):null,hp=high!==null?pos(high,mn,mx):null;
    var lW=Math.max(0,pp),pL=Math.max(0,Math.min(pp,cp)),pW=Math.max(0,Math.abs(cp-pp));
    var rL=Math.max(pp,cp),rW=Math.max(0,100-rL);
    var ppOk=d.pp>=90,cpOk=d.cp>=90;
    var emOut=d.em&&d.em.toLowerCase().indexOf('outside')!==-1;
    var emBadgeCls=emOut?'cv-bg':'cv-ba';

    /* Prevent anchor label overlap: offset call label if too close to put label */
    var putLabelAdj='top:0',callLabelAdj='top:0';
    if(Math.abs(cp-pp)<12){putLabelAdj='top:0';callLabelAdj='top:20px';}

    old.className='condor-viz';
    old.innerHTML=
      '<div class="cv-hd">'+
        '<div>'+
          '<div class="cv-ey">Iron Condor Structure</div>'+
          '<div class="cv-ti">'+d.sym+'<em>· '+(d.dte||'—')+' · '+(d.em||'Verify')+'</em></div>'+
        '</div>'+
        '<div class="cv-bd">'+
          '<span class="cv-b '+(ppOk&&cpOk?'cv-bg':'cv-ba')+'">P(OTM) '+pct(Math.min(d.pp||0,d.cp||0))+'</span>'+
          '<span class="cv-b '+emBadgeCls+'">'+(d.em||'Verify')+'</span>'+
        '</div>'+
      '</div>'+
      /* Track wrapper */
      '<div class="cv-tw">'+
        /* Floating anchor labels above */
        '<div class="cv-la" style="left:'+f(pp,3)+'%;'+putLabelAdj+'">'+
          '<div class="cv-ac"><strong>'+(d.sp||'—')+'</strong><small>Short Put</small></div>'+
        '</div>'+
        '<div class="cv-la" style="left:'+f(cp,3)+'%;'+callLabelAdj+'">'+
          '<div class="cv-ac"><strong>'+(d.sc||'—')+'</strong><small>Short Call</small></div>'+
        '</div>'+
        /* The track */
        '<div class="cv-tr">'+
          '<div class="cv-z cv-zp" style="left:0;width:'+f(lW,3)+'%"><span class="cv-zt">Put Wing</span></div>'+
          '<div class="cv-z cv-zf" style="left:'+f(pL,3)+'%;width:'+f(pW,3)+'%"><span class="cv-zt">Profit Zone</span></div>'+
          '<div class="cv-z cv-zc" style="left:'+f(rL,3)+'%;width:'+f(rW,3)+'%"><span class="cv-zt">Call Wing</span></div>'+
          (lp!==null&&hp!==null?'<div class="cv-em" style="left:'+f(lp,3)+'%;width:'+f(hp-lp,3)+'%"></div>':'')+
          (lp!==null?'<div class="cv-mk cv-me" style="left:'+f(lp,3)+'%"></div>':'')+
          (hp!==null?'<div class="cv-mk cv-me" style="left:'+f(hp,3)+'%"></div>':'')+
          '<div class="cv-mk cv-ma" style="left:'+f(pp,3)+'%"></div>'+
          '<div class="cv-mk cv-ma" style="left:'+f(cp,3)+'%"></div>'+
          '<div class="cv-mk cv-ms" style="left:'+f(sp,3)+'%"></div>'+
        '</div>'+
        /* Floating labels below */
        (lp!==null?'<div class="cv-lb cv-el" style="left:'+f(lp,3)+'%;top:calc(68px + 8px)">EM Low<br>$'+f(low,2)+'</div>':'')+
        '<div class="cv-lb" style="left:'+f(sp,3)+'%;top:calc(68px + 6px)">'+
          '<div class="cv-sc"><strong>$'+f(d.spot,2)+'</strong><small>Spot</small></div>'+
        '</div>'+
        (hp!==null?'<div class="cv-lb cv-el" style="left:'+f(hp,3)+'%;top:calc(68px + 8px)">EM High<br>$'+f(high,2)+'</div>':'')+
      '</div>'+
      /* Stats strip */
      '<div class="cv-ss">'+
        '<div class="cv-st"><div class="cv-sl">Net Credit</div><div class="cv-sv">'+(d.credit||'—')+'</div></div>'+
        '<div class="cv-st"><div class="cv-sl">ROC</div><div class="cv-sv">'+(d.roc||'—')+'</div></div>'+
        '<div class="cv-st"><div class="cv-sl">Expected Move</div><div class="cv-sv">'+(d.move?'±$'+f(d.move,2):'Verify')+'</div></div>'+
        '<div class="cv-st"><div class="cv-sl">IV Status</div><div class="cv-sv">'+(d.iv||'Verify')+'</div></div>'+
      '</div>'+
      /* Probability cards */
      '<div class="cv-pr">'+
        '<div class="cv-pc">'+
          '<div class="cv-pn '+(ppOk?'ok':'lo')+'">'+pct(d.pp)+'</div>'+
          '<div class="cv-pd">'+
            '<div class="cv-pg">Put Anchor P(OTM)</div>'+
            '<div class="cv-pk">Short Put · '+(d.sp||'—')+'</div>'+
            '<div class="cv-pt"><div class="cv-pf '+(ppOk?'ok':'lo')+'" style="width:'+f(clamp(d.pp),3)+'%"></div><div class="cv-px"></div></div>'+
          '</div>'+
        '</div>'+
        '<div class="cv-pc">'+
          '<div class="cv-pn '+(cpOk?'ok':'lo')+'">'+pct(d.cp)+'</div>'+
          '<div class="cv-pd">'+
            '<div class="cv-pg">Call Anchor P(OTM)</div>'+
            '<div class="cv-pk">Short Call · '+(d.sc||'—')+'</div>'+
            '<div class="cv-pt"><div class="cv-pf '+(cpOk?'ok':'lo')+'" style="width:'+f(clamp(d.cp),3)+'%"></div><div class="cv-px"></div></div>'+
          '</div>'+
        '</div>'+
      '</div>';
  }

  function details(){
    var d=data(),t=document.querySelector('#blueprint .title');
    if(t)t.textContent=d.sym+' Candidate Ticket';
    rename('Conservative Credit','Credit');
    upsert('Put Anchor P(OTM)',pct(d.pp),true);
    upsert('Call Anchor P(OTM)',pct(d.cp),true);
    upsert('EM Status',d.em||'Verify');
    upsert('IV Status',d.iv||'Verify');
    upsert('Review Status',d.review||'Manual review');
    [].forEach.call(document.querySelectorAll('#ticketBox .review-list li'),function(li){
      if((li.textContent||'').toLowerCase().indexOf('educational review only')!==-1)
        li.innerHTML='<strong>Educational review only:</strong> verify live option-chain pricing, liquidity, earnings, and risk before any decision.';
    });
  }

  function hi(i){selected=Number(i)||0;[].forEach.call(document.querySelectorAll('#resultsBody tr'),function(r,j){r.classList.toggle('row-active',j===selected);j===selected?r.setAttribute('aria-current','true'):r.removeAttribute('aria-current');});}
  function go(){var target=document.getElementById('blueprint')||document.getElementById('ticketBox');if(target&&target.scrollIntoView)target.scrollIntoView({behavior:'smooth',block:'start'});}
  function enhance(i,scroll){selected=Number(i)||0;styles();hi(selected);details();graph();if(scroll)go();}

  function links(){
    [].forEach.call(document.querySelectorAll('#resultsBody tr'),function(r,i){
      if(!r.cells||r.cells.length<2||r.querySelector('.empty'))return;
      r.setAttribute('tabindex','0');r.setAttribute('role','button');r.setAttribute('aria-label','View candidate ticket for row '+(i+1));
      var c=r.cells[1],sym=(c.textContent||'').trim();
      if(!sym||c.querySelector('.candidate-symbol-link'))return;
      c.innerHTML='';
      var a=document.createElement('a');a.href='#blueprint';a.className='candidate-symbol-link';a.textContent=sym;
      a.setAttribute('aria-label','View '+sym+' candidate ticket');
      a.onclick=function(e){e.preventDefault();e.stopPropagation();if(typeof window.showTicket==='function')window.showTicket(i);enhance(i,true);};
      c.appendChild(a);
    });
  }

  function wrap(){
    if(typeof window.showTicket==='function'&&!window.showTicket.__poppasTicket){
      var oldShow=window.showTicket;
      window.showTicket=function(i){selected=Number(i)||0;var out=oldShow.apply(this,arguments);setTimeout(function(){enhance(selected,false);},0);return out;};
      window.showTicket.__poppasTicket=true;
    }
    if(typeof window.render==='function'&&!window.render.__poppasTicket){
      var oldRender=window.render;
      window.render=function(){var out=oldRender.apply(this,arguments);setTimeout(function(){links();enhance(selected,false);},0);return out;};
      window.render.__poppasTicket=true;
    }
  }

  function start(){if(started)return;started=true;styles();patchMap();wrap();links();enhance(selected,false);var b=document.getElementById('resultsBody');if(b&&window.MutationObserver)new MutationObserver(function(){links();hi(selected);}).observe(b,{childList:true,subtree:true});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
  setTimeout(start,250);
  setTimeout(function(){patchMap();wrap();links();enhance(selected,false);},1200);
})();
