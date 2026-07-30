// BOOT SMOKE — loads the ENTIRE app (every script tag) in jsdom exactly as the
// browser does, fires DOMContentLoaded + load, and asserts the app initialises
// with no thrown errors and all core singletons present. Because it executes
// every file, it is a broad regression signal: any parse/init breakage in any
// module surfaces here.
const fs=require('fs'), path=require('path'), vm=require('vm');
const { JSDOM } = require('jsdom');
require('fake-indexeddb/auto');
const WWW = process.env.WWW || require('path').join(__dirname,'..','www');
let pass=0,fail=0; const ok=(n,c,x='')=>{ c?(pass++,console.log('  ✓ '+n)):(fail++,console.error('  ✗ '+n+(x?'  → '+x:''))); };

const errors = [];
const dom = new JSDOM(fs.readFileSync(path.join(WWW,'index.html'),'utf8'),{ url:'https://localhost/', runScripts:'outside-only', pretendToBeVisual:true });
const win=dom.window, doc=win.document;
win.indexedDB=globalThis.indexedDB; win.scrollTo=()=>{};
win.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
win.requestAnimationFrame=cb=>setTimeout(()=>cb(Date.now()),0);
win.cancelAnimationFrame=()=>{};
win.URL.createObjectURL=()=>'blob:fake'; win.URL.revokeObjectURL=()=>{};
const ctx2d=new Proxy({},{get:()=>()=>({data:[]})});
win.HTMLCanvasElement.prototype.getContext=()=>ctx2d;
win.HTMLElement.prototype.scrollIntoView=()=>{};
win.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/jpeg;base64,AAAA';
win.fetch=async()=>({ok:false,status:404,json:async()=>({}),text:async()=>''});
win.addEventListener('error', e => errors.push('window.error: ' + (e.error?.message || e.message)));

let scriptCount=0, missing=[];
let big='';
for(const s of [...doc.querySelectorAll('script')]){
  const src=s.getAttribute('src');
  if(src){
    if(/^https?:/.test(src))continue;
    const p = path.join(WWW, src.split('?')[0]);
    if(!fs.existsSync(p)){ missing.push(src); continue; }
    scriptCount++; big+='\n//—'+src+'\n'+fs.readFileSync(p,'utf8');
  } else big+='\n'+s.textContent;
}

console.log('App boot smoke ('+WWW+')');
ok('every referenced script file exists ('+scriptCount+' files)', missing.length===0, missing.join(', '));

let threw=null;
try {
  vm.runInContext(big, dom.getInternalVMContext(), {filename:'app-bundle.js'});
} catch(e){ threw = e; }
ok('the whole app bundle parses & executes with no thrown error', !threw, threw && (threw.message+' @ '+(threw.stack||'').split('\n')[1]));

let domErr=null;
try {
  doc.dispatchEvent(new win.Event('DOMContentLoaded'));
  win.dispatchEvent(new win.Event('load'));
} catch(e){ domErr = e; }
ok('DOMContentLoaded + load fire without throwing', !domErr, domErr && domErr.message);

setTimeout(()=>{
  // Expose core singletons the app defines, then assert they came up.
  const need = ['App','nodeStore','KnowledgeNode','SpacedRepetition','ReviewView','GuidedView',
    'CompetencyView','CoachEngine','StudyCoach','SocraticTutor','AIService','ExamReadiness',
    'NewCardPacer','LocalGrader','KNText','MatchOptions','MatchGroup','CoachFacts','AppFeatures','Toast','Modal'];
  const expose = '(function(){var o={};'+need.map(n=>`try{o.${n}=typeof ${n}!=='undefined'?${n}:undefined;}catch(e){o.${n}=undefined;}`).join('')+'return o;})()';
  let globals={};
  try { globals = vm.runInContext(expose, dom.getInternalVMContext()); } catch(e){}

  need.forEach(n => ok('singleton present: '+n, typeof globals[n] !== 'undefined'));

  ok('no uncaught window errors during boot', errors.length===0, errors.join(' | '));

  // A couple of liveness checks — the app is actually usable, not just loaded.
  try {
    const kn = new globals.KnowledgeNode({ title:'Boot', subject:'S', processingStatus:'ready',
      questions:[{id:'q1',type:'recall',question:'x',answer:'y'}] });
    globals.nodeStore.save(kn);
    ok('a node can be created and saved after boot', globals.nodeStore.getAll().some(n=>n.title==='Boot'));
    ok('ExamReadiness computes on a real node', typeof globals.ExamReadiness.assess([kn], null).score === 'number');
    ok('NewCardPacer reports a daily budget', globals.NewCardPacer.budget('normal') > 0);
  } catch(e){ ok('post-boot liveness checks run', false, e.message); }

  console.log('\n'+(fail? 'FAIL: '+fail : 'ALL '+pass+' checks passed'));
  process.exit(fail?1:0);
}, 500);
