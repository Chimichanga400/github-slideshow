// End-to-end (jsdom): a matching worksheet becomes ONE two-column table in the
// AI Exam, tapping pairs items to options, and submitting marks every pair for
// free (zero AI/network calls) — exactly the "like the image" experience.
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
let fetchCalls=0; win.fetch=async()=>{ fetchCalls++; return {ok:false,status:404,json:async()=>({}),text:async()=>''}; };
win.confirm=()=>true;
win.console.error=()=>{}; win.console.warn=()=>{};
let big='';
for(const s of [...doc.querySelectorAll('script')]){
  const src=s.getAttribute('src');
  if(src){ if(/^https?:/.test(src))continue; big+='\n'+fs.readFileSync(path.join(WWW,src.split('?')[0]),'utf8'); }
  else big+='\n'+s.textContent;
}
big+='\n;try{window.CompetencyView=CompetencyView;window.KnowledgeNode=KnowledgeNode;window.MatchGroup=MatchGroup;window.MatchOptions=MatchOptions;window.AIService=AIService;}catch(e){}';
vm.runInContext(big, dom.getInternalVMContext(), {filename:'app.js'});
doc.dispatchEvent(new win.Event('DOMContentLoaded')); win.dispatchEvent(new win.Event('load'));
const W=win;

const OPTS='A — 50%\nB — Medical aid contribution paid on behalf of an employee\nC — 20%\nD — 0%\nE — Allowable retirement contributions';
const instr='Match the items in COLUMN B with those in COLUMN A:';
const mk=(id,prompt,ans)=>({ id, type:'recall', question: instr+'\n'+prompt+'\n'+OPTS, answer: ans });

const tap=(elem)=>elem.dispatchEvent(new W.Event('click',{bubbles:true}));

setTimeout(async ()=>{
  console.log('Match-and-Pair — full exam flow (jsdom)');
  const CV=W.CompetencyView;
  // make sure no AI path is taken even if it tried
  W.AIService.hasApiKey=()=>false;

  const node=new W.KnowledgeNode({ title:'Tax', subject:'Tax', processingStatus:'ready', questions:[
    mk('q7','7. Inclusion rate of travel allowance for PAYE purposes','A — 50%'),
    mk('q8','8. Dividends withholding tax rate','C — 20%'),
    mk('q9','9. Fringe benefit example','B — Medical aid contribution paid on behalf of an employee'),
  ] });

  // 1) session build collapses the set into ONE slot
  const sess=CV._buildSession([node],8);
  ok('the matching set is ONE paper slot, not three', sess.length===1, 'len='+sess.length);
  ok('that slot is a match group with all 3 prompts', sess[0].match && sess[0].match.prompts.length===3);

  // 1b) the Timed Quiz keeps matching items per-item (grouping OFF)
  const timed=CV._buildSession([node],10,false);
  ok('Timed quiz does NOT group (3 separate items, still per-item tappable)', timed.length===3 && !timed.some(s=>s.match), 'len='+timed.length);

  // 2) render the exam question — two-column table appears
  const host=doc.getElementById('comp-content') || (()=>{ const d=doc.createElement('div'); d.id='comp-content'; doc.body.appendChild(d); return d; })();
  CV._session=sess; CV._idx=0; CV._answers=[]; CV._started=true;
  CV._renderAIExamQuestion();
  const rows=host.querySelectorAll('#mp-rows .mp-row');
  const bank=host.querySelectorAll('#mp-bank .mp-opt');
  ok('Column A shows 3 tappable item rows', rows.length===3, 'rows='+rows.length);
  ok('Column B shows the 5 shared options', bank.length===5, 'bank='+bank.length);
  ok('the generic instruction shows once as a heading', /Match the items/.test(host.innerHTML));
  ok('rows show ONLY their item text (no options blob)', !/50%/.test(rows[0].textContent) && /travel allowance/.test(rows[0].textContent));

  // 3) match all three correctly by tap-item then tap-option
  const opt=(L)=>[...bank].find(b=>b.dataset.letter===L);
  tap(rows[0]); tap(opt('A'));   // q7 → A (correct)
  tap(rows[1]); tap(opt('C'));   // q8 → C (correct)
  tap(rows[2]); tap(opt('B'));   // q9 → B (correct)
  ok('choices saved live into the answer state', JSON.stringify(CV._answers[0].letters)===JSON.stringify(['A','C','B']), JSON.stringify(CV._answers[0].letters));
  ok('a chosen row shows its assigned letter badge', rows[0].querySelector('.mp-badge').textContent==='A');

  // 4) navigation preserves the matches (re-render, re-read)
  CV._renderAIExamQuestion();
  ok('re-rendering the paper keeps the matches', JSON.stringify(CV._answers[0].letters)===JSON.stringify(['A','C','B']));
  ok('badges are restored after navigation', host.querySelector('#mp-rows .mp-row .mp-badge').textContent==='A');

  // 5) submit → graded for free, all correct
  const before=fetchCalls;
  await CV._finishAIExam();
  ok('results screen is shown', /AI Exam Results/.test(host.innerHTML));
  ok('all three pairs scored 100 (three 100/100 rows in the breakdown)', (host.innerHTML.match(/100\/100<\/span>/g)||[]).length===3, (host.innerHTML.match(/100\/100<\/span>/g)||[]).length+'');
  ok('NO network/AI call was made for a pure matching paper', fetchCalls===before, 'fetchCalls delta='+(fetchCalls-before));
  ok('feedback credits a free instant check', /No AI credits used/.test(host.innerHTML));

  // 6) a wrong match is marked wrong for free (definitive)
  CV._session=sess; CV._idx=0; CV._answers=[{ item:sess[0], match:true, letters:['D','C','B'], skipped:false }];
  const before2=fetchCalls;
  await CV._finishAIExam();
  ok('one wrong + two right → two 100s and one 0', (host.innerHTML.match(/100\/100<\/span>/g)||[]).length===2 && /0\/100<\/span>/.test(host.innerHTML));
  ok('a wrong match still costs no AI call', fetchCalls===before2);
  ok('wrong match shows the model answer', /Not the right match/.test(host.innerHTML));

  console.log('\n'+(fail? 'FAIL: '+fail : 'ALL '+pass+' checks passed'));
  process.exit(fail?1:0);
}, 500);
