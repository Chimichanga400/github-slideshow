// Leech detection + intervention: a card failed too many times stops being
// re-drilled and the learner is routed to understand the concept instead —
// plus leeches surface as a high-priority Exam Readiness action. Free/local.
const fs=require('fs'), path=require('path'), vm=require('vm');
const { JSDOM } = require('jsdom');
require('fake-indexeddb/auto');
const WWW=process.env.WWW||require('path').join(__dirname,'..','www');
let pass=0,fail=0; const ok=(n,c,x='')=>{ c?(pass++,console.log('  ✓ '+n)):(fail++,console.error('  ✗ '+n+(x?'  → '+x:''))); };

// ── Part A: LeechDetector unit (pure) ──
const LD = require(path.join(WWW,'js/core/LeechDetector.js'));
console.log('A) LeechDetector — pure detection');
ok('threshold is a sane small number', LD.THRESHOLD >= 3 && LD.THRESHOLD <= 8);
ok('a count below threshold is NOT a leech', !LD.isLeech(LD.THRESHOLD - 1));
ok('a count at threshold IS a leech', LD.isLeech(LD.THRESHOLD));
ok('accepts a struggle record too', LD.isLeech({ count: LD.THRESHOLD + 2 }));
const nodeA = { id:'nA', title:'Tax', questions:[{id:'q1'},{id:'q2'},{id:'q3'}],
  weakQuestions:[{id:'q1',count:LD.THRESHOLD+1},{id:'q2',count:2}] };
ok('countFor reads the struggle log', LD.countFor(nodeA,'q1') === LD.THRESHOLD+1 && LD.countFor(nodeA,'q3') === 0);
ok('isLeechCard flags only the over-threshold card', LD.isLeechCard(nodeA,'q1') && !LD.isLeechCard(nodeA,'q2') && !LD.isLeechCard(nodeA,'q3'));
const nodeB = { id:'nB', title:'Law', questions:[{id:'x'}], weakQuestions:[{id:'x',count:LD.THRESHOLD+5}] };
const all = LD.leeches([nodeA,nodeB]);
ok('leeches() collects across nodes, worst first', all.length===2 && all[0].node.id==='nB' && all[0].count > all[1].count);
ok('leeches() ignores struggles below threshold', !all.some(l => l.question.id==='q2'));
const src = fs.readFileSync(path.join(WWW,'js/core/LeechDetector.js'),'utf8');
ok('detector is free/local (no AI/network)', !/_callWithFunction|AIService|fetch\(/.test(src));

// ── Part B: Review intervention (DOM) ──
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
big+='\n;try{window.ReviewView=ReviewView;window.LeechDetector=LeechDetector;window.LearnerMemory=LearnerMemory;window.nodeStore=nodeStore;window.KnowledgeNode=KnowledgeNode;window.NodeDetailView=NodeDetailView;window.ExamReadiness=ExamReadiness;}catch(e){}';
vm.runInContext(big, dom.getInternalVMContext(), {filename:'app.js'});
doc.dispatchEvent(new win.Event('DOMContentLoaded')); win.dispatchEvent(new win.Event('load'));
const W=win;

setTimeout(async ()=>{
  console.log('B) Review breaks the grind on a leech card');
  const node = new W.KnowledgeNode({ title:'Hard Topic', subject:'Tax', processingStatus:'ready',
    questions:[{id:'q1',type:'recall',question:'A tricky question',answer:'the answer'}] });
  W.nodeStore.save(node);
  // Fail it up to (threshold-1) times via the struggle log — not yet a leech.
  for (let i=0;i<W.LeechDetector.THRESHOLD-1;i++) W.LearnerMemory.recordStruggle(node, node.questions[0], 1);
  W.nodeStore.save(node);

  // Drive a review session on this one card.
  W.ReviewView._session = [{ node, question: node.questions[0], state: node.srsState['q1']||null }];
  W.ReviewView._index = 0; W.ReviewView._revealed = true; W.ReviewView._stats = {again:0,hard:0,good:0,easy:0};
  W.ReviewView._inSession = true;

  // Rate "Again": this pushes the count to the threshold → leech → intervention.
  W.ReviewView._rate(1);
  await new Promise(r=>setTimeout(r,20));
  const leechEl = doc.getElementById('review-leech');
  ok('intervention appears once the card crosses the leech threshold', !!leechEl);
  ok('it names how many times it was missed', /missed \d+/.test(leechEl.textContent));
  ok('it offers to understand the concept', !!doc.getElementById('leech-understand'));
  ok('it offers to keep drilling (learner stays in control)', !!doc.getElementById('leech-continue'));
  ok('the leech card was NOT auto-re-queued behind the prompt', W.ReviewView._session.length === 1);

  console.log('C) "Understand" routes to the topic, "Keep drilling" re-queues');
  let openedNode = null;
  W.NodeDetailView.open = (id, section) => { openedNode = { id, section }; };
  doc.getElementById('leech-understand').click();
  ok('Understand opens the topic to actually learn it', openedNode && openedNode.id === node.id);
  ok('the prompt is dismissed after choosing', !doc.getElementById('review-leech'));

  // Re-trigger to test the "keep drilling" path (leech already shown once, so
  // reset the per-session shown-set to simulate a fresh session).
  W.ReviewView._leechShown = null;
  W.ReviewView._session = [{ node, question: node.questions[0], state: node.srsState['q1']||null }];
  W.ReviewView._index = 0; W.ReviewView._revealed = true; W.ReviewView._stats = {again:0,hard:0,good:0,easy:0};
  W.ReviewView._rate(1);
  await new Promise(r=>setTimeout(r,20));
  const before = W.ReviewView._session.length;
  doc.getElementById('leech-continue').click();
  ok('Keep drilling re-queues the card and continues', W.ReviewView._session.length === before + 1);
  ok('prompt cleared after keep-drilling', !doc.getElementById('review-leech'));

  console.log('D) A non-leech Again still re-queues normally (no regression)');
  const node2 = new W.KnowledgeNode({ title:'Easy Topic', subject:'Tax', processingStatus:'ready',
    questions:[{id:'e1',type:'recall',question:'q',answer:'a'}] });
  W.nodeStore.save(node2);
  W.ReviewView._leechShown = null;
  W.ReviewView._session = [{ node: node2, question: node2.questions[0], state: null }];
  W.ReviewView._index = 0; W.ReviewView._revealed = true; W.ReviewView._stats = {again:0,hard:0,good:0,easy:0};
  W.ReviewView._rate(1); // first-ever miss — not a leech
  await new Promise(r=>setTimeout(r,20));
  ok('no intervention for a card missed once', !doc.getElementById('review-leech'));
  ok('normal Again re-queues the card', W.ReviewView._session.length === 2);

  console.log('E) Leeches surface as a high-priority Exam Readiness action');
  const r = W.ExamReadiness.assess([node], null); // node is a leech now
  const leechAction = r.actions.find(a => a.kind === 'leech');
  ok('readiness lists a leech action', !!leechAction);
  ok('…that points at the topic to understand', leechAction && leechAction.nodeId === node.id);
  ok('…with meaningful priority (lift > a plain review)', leechAction && leechAction.lift >= 9);

  console.log('\n'+(fail? 'FAIL: '+fail : 'ALL '+pass+' checks passed'));
  process.exit(fail?1:0);
}, 500);
