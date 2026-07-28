// Smart mock-exam selection: instead of a pure random draw, the exam weights
// questions by how valuable they are to be tested on (struggled / due / never
// tested / examiner-relevant) while keeping subject breadth and variety.
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
big+='\n;try{window.CompetencyView=CompetencyView;window.KnowledgeNode=KnowledgeNode;window.LearnerMemory=LearnerMemory;}catch(e){}';
vm.runInContext(big, dom.getInternalVMContext(), {filename:'app.js'});
doc.dispatchEvent(new win.Event('DOMContentLoaded')); win.dispatchEvent(new win.Event('load'));
const W=win;

const runs = (fn, n=200) => { let hit=0; for(let i=0;i<n;i++) if(fn()) hit++; return hit/n; };

setTimeout(()=>{
  console.log('Smart mock-exam selection');
  const CV = W.CompetencyView;

  console.log('1) Weak (struggled) questions are favoured over untouched ones');
  // one topic: q_weak struggled 3x, q_plain never studied
  const nodeW = new W.KnowledgeNode({ title:'A', subject:'Tax', processingStatus:'ready',
    questions:[{id:'weak',type:'recall',question:'weak q',answer:'a'},{id:'plain',type:'recall',question:'plain q',answer:'b'}] });
  W.LearnerMemory.recordStruggle(nodeW, nodeW.questions[0], 1);
  W.LearnerMemory.recordStruggle(nodeW, nodeW.questions[0], 1);
  W.LearnerMemory.recordStruggle(nodeW, nodeW.questions[0], 1);
  // pick 1 of 2, many times — the weak one should win far more often than chance
  const weakRate = runs(() => CV._buildSession([nodeW], 1)[0].q.id === 'weak');
  ok('the struggled question is picked well above 50% of the time', weakRate > 0.65, 'rate='+weakRate.toFixed(2));

  console.log('2) Due/overdue questions are favoured');
  const nodeD = new W.KnowledgeNode({ title:'B', subject:'Tax', processingStatus:'ready',
    questions:[{id:'due',type:'recall',question:'due q',answer:'a'},{id:'fresh',type:'recall',question:'fresh q',answer:'b'}] });
  nodeD.srsState['due']  = { repetitions:2, nextReview: Date.now()-86400000, interval:5, ease:2.5 }; // overdue
  nodeD.srsState['fresh']= { repetitions:2, nextReview: Date.now()+30*86400000, interval:30, ease:2.5 }; // not due
  const dueRate = runs(() => CV._buildSession([nodeD], 1)[0].q.id === 'due');
  ok('the overdue question is picked more often than the fresh one', dueRate > 0.6, 'rate='+dueRate.toFixed(2));

  console.log('3) Subject breadth — no single topic dominates the paper');
  const mk = (t, base) => new W.KnowledgeNode({ title:t, subject:t, processingStatus:'ready',
    questions: Array.from({length:10},(_,i)=>({id:base+i,type:'recall',question:'q',answer:'a'})) });
  const nA = mk('Acc','a'), nB = mk('Law','b'), nC = mk('Maths','c');
  const sess = CV._buildSession([nA,nB,nC], 9);
  ok('exam has the requested number of questions', sess.length===9);
  const bySubj = {}; sess.forEach(x => bySubj[x.node.subject]=(bySubj[x.node.subject]||0)+1);
  ok('all three subjects are represented (breadth, not one topic)', Object.keys(bySubj).length===3, JSON.stringify(bySubj));
  ok('no subject dominates (each ≤ 4 of 9)', Object.values(bySubj).every(c=>c<=4), JSON.stringify(bySubj));

  console.log('4) Examiner relevance — past-paper subjects get a boost');
  W.localStorage.setItem('kn_exam_style_tax', JSON.stringify({ papers:[{ name:'2024', analysis:{ topicAreas:['x'] } }] }));
  ok('_hasPastPaper detects an analysed paper', CV._hasPastPaper('Tax') === true && CV._hasPastPaper('Nothing') === false);
  // two topics, equal otherwise; the one WITH a past paper should be favoured
  const nPaper = new W.KnowledgeNode({ title:'P', subject:'Tax',    processingStatus:'ready', questions:[{id:'p1',type:'recall',question:'q',answer:'a'}] });
  const nNone  = new W.KnowledgeNode({ title:'N', subject:'Random', processingStatus:'ready', questions:[{id:'n1',type:'recall',question:'q',answer:'a'}] });
  const paperRate = runs(() => CV._buildSession([nPaper,nNone], 1)[0].node.subject === 'Tax');
  ok('a past-paper subject is favoured over one without', paperRate > 0.55, 'rate='+paperRate.toFixed(2));
  W.localStorage.removeItem('kn_exam_style_tax');

  console.log('5) Shape, bounds, variety, and no-crash edges');
  ok('returns the same {q,node} shape as before', sess[0].q && sess[0].node && typeof sess[0].q.question==='string');
  ok('never returns more than max', CV._buildSession([nA], 3).length===3);
  ok('returns everything when fewer questions than max exist', CV._buildSession([nPaper], 8).length===1);
  ok('empty library → empty session, no crash', CV._buildSession([], 8).length===0);
  ok('no duplicate questions in a session', (()=>{ const s=CV._buildSession([nA,nB,nC],9); return new Set(s.map(x=>x.q.id)).size===s.length; })());
  // variety: two exams over a big pool should differ at least sometimes
  const differ = runs(()=>{ const a=CV._buildSession([nA,nB,nC],5).map(x=>x.q.id).join(); const b=CV._buildSession([nA,nB,nC],5).map(x=>x.q.id).join(); return a!==b; }, 20);
  ok('repeated exams vary (not identical every time)', differ > 0.3, 'differ='+differ.toFixed(2));

  console.log('6) Free/local — the selector makes no AI/network call');
  const src = fs.readFileSync(path.join(WWW,'js/ui/CompetencyView.js'),'utf8');
  ok('selection logic is on-device only', /_buildSession[\s\S]*?scored\.sort/.test(src) && !/_buildSession[\s\S]{0,600}_callWithFunction/.test(src));

  console.log('\n'+(fail? 'FAIL: '+fail : 'ALL '+pass+' checks passed'));
  process.exit(fail?1:0);
}, 400);
