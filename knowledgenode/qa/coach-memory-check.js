// BUG: the study coach forgot what it had been told and re-asked the same
// questions ("how many hours per day can you study?") over and over.
// Three compounding defects, all covered here:
//   1. only the last 4 messages (2 exchanges) were sent to the AI in advise mode
//   2. no durable store of facts the student stated — they rolled off forever
//   3. the conversation lived in memory only — reopening the app wiped it
// This suite replays the user's real planning conversation.
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
win.HTMLCanvasElement.prototype.getContext=()=>ctx2d; win.HTMLElement.prototype.scrollIntoView=()=>{};
win.HTMLCanvasElement.prototype.toDataURL=()=>'data:image/jpeg;base64,AAAA';
win.fetch=async()=>({ok:false,status:404,json:async()=>({}),text:async()=>''});
win.console.error=()=>{}; win.console.warn=()=>{};
let big='';
for(const s of [...doc.querySelectorAll('script')]){ const src=s.getAttribute('src');
  if(src){ if(/^https?:/.test(src))continue; big+='\n'+fs.readFileSync(path.join(WWW,src.split('?')[0]),'utf8'); } else big+='\n'+s.textContent; }
big+='\n;try{window.CoachEngine=CoachEngine;window.CoachFacts=CoachFacts;window.AIService=AIService;window.StudyCoach=StudyCoach;}catch(e){}';
vm.runInContext(big, dom.getInternalVMContext(), {filename:'app.js'});
doc.dispatchEvent(new win.Event('DOMContentLoaded')); win.dispatchEvent(new win.Event('load'));
const W=win;

setTimeout(async ()=>{
  console.log('Study coach memory');
  const CF=W.CoachFacts, CE=W.CoachEngine;
  CF.clear(); CE.resetMemory();

  console.log('1) Durable facts survive, and CORRECTIONS replace (not duplicate)');
  CF.set('exam dates','31 August');
  CF.set('Exam Dates','first week of December');   // same fact, different casing/spacing
  ok('a corrected fact overwrites instead of duplicating', CF.all().filter(f=>/exam/.test(f.key)).length===1, JSON.stringify(CF.all()));
  ok('the NEW value is what is kept', CF.get('exam_dates')==='first week of December', CF.get('exam_dates'));
  CF.set('daily study time','30 min morning + 30 min evening');
  CF.set('subjects','Financial Statements, Cost & Management Accounting, Income Tax Returns, Business Law & Accounting Control (4 total)');
  const blk=CF.block();
  ok('the facts block names the December exam', /first week of December/.test(blk));
  ok('the facts block names the daily study time', /30 min morning/.test(blk));
  ok('the facts block names the 4 subjects', /4 total/.test(blk));
  ok('the block forbids re-asking answered questions', /[Nn]ever ask the student for anything already answered/.test(blk));
  ok('a student-stated fact outranks stale app data (deleted study plan)', /the fact here WINS/.test(blk));

  console.log('2) The coach records facts via hidden [[FACT:]] lines (no extra AI call)');
  const reply='Got it — December it is.\n[[FACT: work schedule = works Monday to Friday]]\n[[SIGNAL:Student planning around work.]]';
  const { clean, signal } = CE.extractSignal(reply);
  ok('the [[FACT:]] line is stripped from what the student sees', !/FACT/.test(clean), clean);
  ok('the [[SIGNAL:]] line is still stripped too', !/SIGNAL/.test(clean));
  ok('the visible reply text survives', /December it is/.test(clean));
  ok('the signal is still extracted for the Director', /planning around work/.test(signal||''));
  ok('the fact was absorbed into durable memory', CF.get('work_schedule')==='works Monday to Friday', CF.get('work_schedule'));

  console.log('3) The conversation survives closing and reopening the app');
  CE.history=[{role:'user',text:'i can do 30 minutes morning and evening'},{role:'coach',text:'Noted.'}];
  CE.saveHistory();
  CE.history=[];                                   // simulate app restart
  CE.loadHistory();
  ok('history is restored after a restart', CE.history.length===2, 'len='+CE.history.length);
  ok('the restored message is the real one', /30 minutes morning and evening/.test(CE.history[0].text));
  ok('facts also survive the restart', CF.get('exam_dates')==='first week of December');

  console.log('4) A failed AI call is shown but never fed back as context');
  CE.history=[{role:'user',text:'yes'},{role:'coach',text:'Sorry — I could not reach the AI just now.',error:true},{role:'user',text:'that works'}];
  let captured=null;
  const realCoach=W.AIService.studyCoach;
  W.AIService.studyCoach=async(q,hist)=>{ captured=hist; return 'ok'; };
  await CE.turn('that works');
  ok('the error message is NOT sent back to the AI', !captured.some(h=>/could not reach the AI/.test(h.text)), JSON.stringify(captured.map(h=>h.text)));
  ok('the real messages ARE still sent', captured.some(h=>h.text==='yes'));
  W.AIService.studyCoach=realCoach;

  console.log('5) The history window is deep enough for a planning conversation');
  // Replay the shape of the real bug: capacity stated, then 8 more turns.
  CE.resetMemory(); CF.clear();
  CE.history=[{role:'user',text:'i can do 30 minutes at night and 30 in the morning'}];
  for(let i=0;i<8;i++){ CE.history.push({role:'coach',text:'reply '+i}); CE.history.push({role:'user',text:'follow up '+i}); }
  let cap2=null;
  W.AIService._callClaudeWithCache=async(sys,messages)=>{ cap2={sys,messages}; return 'ok'; };
  await W.AIService.studyCoach('build the plan', CE.history);
  const sent=cap2.messages[0].content;
  ok('the capacity stated 17 messages ago is STILL in the prompt',
    /30 minutes at night and 30 in the morning/.test(sent), 'window too shallow');
  ok('the whole replayed conversation is included', (sent.match(/follow up /g)||[]).length===8, (sent.match(/follow up /g)||[]).length+'');
  // and the old behaviour would have failed this:
  const oldWindow=CE.history.slice(-4).map(h=>h.text).join('\n');
  ok('(proof) the OLD 4-message window would have LOST it', !/30 minutes at night/.test(oldWindow));

  console.log('6) Facts reach the AI on every turn, via the system prompt');
  CF.set('exam dates','first week of December');
  await W.AIService.studyCoach('anything', []);
  ok('the CONFIRMED FACTS block is in the system prompt', /CONFIRMED FACTS/.test(cap2.sys));
  ok('the December exam date reaches the AI even with an EMPTY history', /first week of December/.test(cap2.sys));
  ok('the coach is instructed how to record new facts', /\[\[FACT:/.test(cap2.sys));

  console.log('7) Long conversations stay within a safe size');
  const huge=[]; for(let i=0;i<120;i++) huge.push({role:i%2?'coach':'user',text:'x'.repeat(400)});
  await W.AIService.studyCoach('q', huge);
  ok('a 120-message history is trimmed, not sent whole', cap2.messages[0].content.length < 20000, 'len='+cap2.messages[0].content.length);
  ok('it still notes that earlier messages were dropped', /earlier message\(s\) not shown/.test(cap2.messages[0].content));

  console.log('8) Reset genuinely forgets everything');
  CE.resetMemory();
  ok('history cleared', CE.history.length===0);
  ok('facts cleared', CF.all().length===0);
  ok('nothing comes back after a reload', (CE.loadHistory(), CE.history.length===0));

  console.log('\n'+(fail? 'FAIL: '+fail : 'ALL '+pass+' checks passed'));
  process.exit(fail?1:0);
}, 500);
