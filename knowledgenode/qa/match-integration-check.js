// End-to-end (jsdom): rendering a matching question in the exam produces real
// tappable option buttons, and tapping one fills the hidden answer field with
// the full "LETTER — text" — so the existing save + free-grading path marks it.
// Also proves an ordinary open question still renders a normal textarea.
const fs=require('fs'), path=require('path'), vm=require('vm');
const { JSDOM } = require('jsdom');
require('fake-indexeddb/auto');
const WWW=process.env.WWW||require('path').join(__dirname,'..','www');
let pass=0,fail=0; const ok=(n,c,x='')=>{ c?(pass++,console.log('  ✓ '+n)):(fail++,console.error('  ✗ '+n+(x?'  → '+x:''))); };
const dom = new JSDOM(fs.readFileSync(path.join(WWW,'index.html'),'utf8'),{ url:'https://localhost/', runScripts:'outside-only', pretendToBeVisual:true });
const win=dom.window, doc=win.document;
win.indexedDB=globalThis.indexedDB; win.scrollTo=()=>{};
win.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
win.requestAnimationFrame=cb=>setTimeout(()=>cb(Date.now()),0); win.cancelAnimationFrame=()=>{};
win.URL.createObjectURL=()=>'blob:fake'; win.URL.revokeObjectURL=()=>{};
const ctx2d=new Proxy({},{get:()=>()=>({data:[]})});
win.HTMLCanvasElement.prototype.getContext=()=>ctx2d;
win.HTMLElement.prototype.scrollIntoView=()=>{};
win.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/jpeg;base64,AAAA';
win.fetch=async()=>({ok:false,status:404,json:async()=>({}),text:async()=>''});
win.console.error=()=>{}; win.console.warn=()=>{};
let big='';
for(const s of [...doc.querySelectorAll('script')]){
  const src=s.getAttribute('src');
  if(src){ if(/^https?:/.test(src))continue; big+='\n'+fs.readFileSync(path.join(WWW,src.split('?')[0]),'utf8'); }
  else big+='\n'+s.textContent;
}
big+='\n;try{window.CompetencyView=CompetencyView;window.MatchOptions=MatchOptions;window.LocalGrader=LocalGrader;}catch(e){}';
vm.runInContext(big, dom.getInternalVMContext(), {filename:'app.js'});
doc.dispatchEvent(new win.Event('DOMContentLoaded')); win.dispatchEvent(new win.Event('load'));
const W=win;

setTimeout(()=>{
  console.log('Matching question — DOM integration');
  const CV=W.CompetencyView;
  const matchQ={ question:'10. Current withholding tax on dividends\nA — 50%\nB — Medical aid contributions\nC — 20%\nD — 15%\nE — 18%', answer:'C — 20%' };
  const openQ ={ question:'Explain the difference between gross income and taxable income.', answer:'gross income is total received' };

  // --- render a matching question into a container and wire taps ---
  const host=doc.createElement('div'); host.id='comp-content'; doc.body.appendChild(host);
  host.innerHTML = '<div class="quiz-card">'+CV._answerBlock(matchQ,'')+'</div>';
  CV._wireMatchTaps(matchQ,'ai-answer');

  const btns=host.querySelectorAll('#match-opts .match-opt');
  ok('matching question renders tappable option buttons', btns.length===5, 'got '+btns.length);
  ok('a hidden #ai-answer field is present', !!host.querySelector('#ai-answer') && host.querySelector('#ai-answer').style.display==='none');
  ok('no free-text placeholder box is shown for a matching question', !host.querySelector('textarea[placeholder]'));
  ok('the Column A stem is shown', /Current withholding tax on dividends/.test(host.querySelector('.quiz-question').innerHTML));

  // --- tap option C ---
  const cBtn=[...btns].find(b=>b.dataset.letter==='C');
  cBtn.dispatchEvent(new W.Event('click',{bubbles:true}));
  const hidden=host.querySelector('#ai-answer');
  ok('tapping C fills the hidden answer with "C — 20%"', hidden.value==='C — 20%', hidden.value);
  ok('tapped button is visually marked picked', cBtn.classList.contains('is-picked'));
  ok('the stored answer grades CORRECT for free (no AI)', W.LocalGrader.match(hidden.value,[matchQ.answer]).verdict==='correct');

  // --- change mind: tap A ---
  const aBtn=[...btns].find(b=>b.dataset.letter==='A');
  aBtn.dispatchEvent(new W.Event('click',{bubbles:true}));
  ok('re-tapping moves the selection to A', aBtn.classList.contains('is-picked') && !cBtn.classList.contains('is-picked'));
  ok('a wrong choice does NOT falsely grade correct', W.LocalGrader.match(host.querySelector('#ai-answer').value,[matchQ.answer]).verdict==='unknown');

  // --- open question keeps the normal textarea ---
  host.innerHTML='<div class="quiz-card">'+CV._answerBlock(openQ,'')+'</div>';
  CV._wireMatchTaps(openQ,'ai-answer');
  ok('open question still renders a free-text answer box', !!host.querySelector('textarea.config-input[placeholder]') && !host.querySelector('#match-opts'));

  // --- revisit: a saved answer re-highlights its option ---
  host.innerHTML='<div class="quiz-card">'+CV._answerBlock(matchQ,'C — 20%')+'</div>';
  const picked=host.querySelector('#match-opts .match-opt.is-picked');
  ok('revisiting a saved paper re-highlights the chosen option', picked && picked.dataset.letter==='C', picked && picked.dataset.letter);

  console.log('\n'+(fail? 'FAIL: '+fail : 'ALL '+pass+' checks passed'));
  process.exit(fail?1:0);
}, 400);
