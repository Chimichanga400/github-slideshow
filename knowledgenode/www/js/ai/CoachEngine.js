/**
 * CoachEngine.js — THE single brain behind every coaching/tutoring surface.
 *
 * The Study Coach chat and the Socratic Tutor overlay are VIEWS over this one
 * engine: one conversation history, one mode state machine, one AI pathway
 * (AIService.studyCoach), one shared memory (LearnerState signals the Director
 * reads). Whatever view the student is in, it is the same entity.
 *
 * Mode state machine (exactly one active at a time):
 *   { kind:'advise' }                          — default coaching
 *   { kind:'tutor',    nodeId, i }             — Socratic tutoring through a
 *                                                Revision Questions node
 *   { kind:'resource', nodeId }                — studying a source-material
 *                                                node's saved content
 *   { kind:'example',  nodeId, example }       — tutoring a worked example
 *                                                (Socratic Tutor overlay)
 *
 * Node-graph integration:
 *   resourceContext()        — reads an EXISTING node's full saved material
 *                              (no re-upload) into the conversation
 *   compileQuestionsNode(id) — programmatically builds a linked Revision
 *                              Questions node from a source node
 *   recordOutcome(gotIt)     — programmatically updates the active Revision
 *                              Questions node (SRS rating + struggle log)
 */
const CoachEngine = {
  history: [],                 // the ONE conversation, shared by every view
  mode: { kind: 'advise' },
  HKEY: 'kn_coach_history',
  HMAX: 60,                    // messages kept on disk

  /* ─── persistence: the conversation survives closing the app ───
     Without this, reopening the app wiped the whole conversation and the coach
     re-asked everything it had already been told. */
  loadHistory() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.HKEY) || 'null');
      if (Array.isArray(raw)) {
        this.history = raw
          .filter(m => m && typeof m.text === 'string' && (m.role === 'user' || m.role === 'coach'))
          .slice(-this.HMAX);
      }
    } catch (e) { /* corrupt or unavailable — start fresh */ }
    return this.history;
  },

  saveHistory() {
    try { localStorage.setItem(this.HKEY, JSON.stringify(this.history.slice(-this.HMAX))); }
    catch (e) { /* quota / private mode — memory still works for this session */ }
  },

  /** Wipe the conversation AND the durable facts (a real "start over"). */
  resetMemory() {
    this.history = [];
    this.mode = { kind: 'advise' };
    try { localStorage.removeItem(this.HKEY); } catch (e) {}
    try { if (typeof CoachFacts !== 'undefined') CoachFacts.clear(); } catch (e) {}
  },

  /* ─── mode transitions (entering any mode leaves the previous one) ─── */
  startTutor(nodeId)   { this.mode = { kind: 'tutor', nodeId, i: 0 }; },
  startResource(nodeId){ this.mode = { kind: 'resource', nodeId }; },
  startExample(node, example) { this.mode = { kind: 'example', nodeId: node.id, example }; },
  end()                { this.mode = { kind: 'advise' }; },

  /* ─── one AI turn — every view calls THIS (the user message is already in
     history; the coach reply is pushed and returned) ─── */
  async turn(question, opts = {}) {
    const exampleContext  = opts.exampleContext
      || (this.mode.kind === 'example' ? this.exampleContext() : null);
    const tutorContext    = (!opts.exampleContext && this.mode.kind === 'tutor')
      ? this.tutorContext() : null;
    const resourceContext = (this.mode.kind === 'resource') ? this.resourceContext() : null;

    // Failed-call notices are shown in the log but never sent back as context.
    const sendable = this.history.filter(h => h && !h.error);
    const answer = await AIService.studyCoach(question, sendable, exampleContext, tutorContext, resourceContext);
    if (!answer || !String(answer).trim()) throw new Error('empty');
    const { clean, signal } = this.extractSignal(answer);
    const entry = { role: 'coach', text: clean };
    this.history.push(entry);
    // Cap history to prevent unbounded growth; keep the opening message.
    if (this.history.length > 50) this.history = [this.history[0], ...this.history.slice(-49)];
    this.saveHistory();
    // Shared memory: the Director reads these signals before its next
    // evaluation — every surface feeds the same brain.
    try {
      if (typeof LearnerState !== 'undefined') {
        LearnerState.saveCoachExchange({
          question, signal: signal || null,
          insight: signal || clean.slice(0, 200),
        });
      }
    } catch (e) { /* optional */ }
    return entry;
  },

  /** Strip the hidden memory lines out of a reply. [[SIGNAL:...]] feeds the
   *  Director; [[FACT: key = value]] lines are absorbed into durable memory so
   *  the coach stops re-asking things the student already answered. Neither is
   *  ever shown to the student. */
  extractSignal(raw) {
    const str    = String(raw || '');
    const match  = str.match(/\[\[SIGNAL:([^\]]+)\]\]/);
    const signal = match ? match[1].trim() : null;
    let clean    = str.replace(/\n?\[\[SIGNAL:[^\]]*\]\]\n?/g, '').trimEnd();
    try {
      if (typeof CoachFacts !== 'undefined') clean = CoachFacts.absorb(clean);
      else clean = clean.replace(/\n?\[\[FACT:[^\]]*\]\]\n?/gi, '\n').trimEnd();
    } catch (e) {
      clean = clean.replace(/\n?\[\[FACT:[^\]]*\]\]\n?/gi, '\n').trimEnd();
    }
    return { clean, signal };
  },

  /* ─── per-mode context builders (rebuilt fresh every turn so the engine
     never loses its subject mid-conversation) ─── */

  tutorContext() {
    if (this.mode.kind !== 'tutor') return null;
    const node = nodeStore.get(this.mode.nodeId);
    const qs = node ? (node.questions || []) : [];
    const q  = qs[this.mode.i];
    if (!node || !q) return null;
    return 'SOCRATIC TUTORING MODE — ACTIVE'
      + '\nTopic: "' + node.title + '" (' + (node.subject || 'general') + ')'
      + '\nQuestion ' + (this.mode.i + 1) + ' of ' + qs.length + ':'
      + '\n"""\n' + q.question + '\n"""'
      + (q.answer ? '\nModel answer (NEVER reveal outright — for steering and checking only):\n"""\n' + q.answer + '\n"""'
                  : '\nNo model answer was captured for this question — tutor from the strategy and check the student\'s reasoning step by step.');
  },

  resourceContext() {
    if (this.mode.kind !== 'resource') return null;
    const node = nodeStore.get(this.mode.nodeId);
    if (!node) return null;
    const src = (typeof LearnerContext !== 'undefined' && LearnerContext._buildSourceText)
      ? LearnerContext._buildSourceText(node, 6000)
      : (node.summary || node.userNotes || node.rawOCR || '');
    return 'RESOURCE MODE — ACTIVE'
      + '\nThe student is studying their saved topic "' + node.title + '" (' + (node.subject || 'general') + ') with you — its full saved material is below. They did NOT re-upload anything; this is read straight from their library.'
      + '\nFULL SAVED MATERIAL:\n"""\n' + src + '\n"""';
  },

  exampleContext() {
    if (this.mode.kind !== 'example' || !this.mode.example) return null;
    const node = nodeStore.get(this.mode.nodeId);
    if (!node) return null;
    const ctx = (typeof LearnerContext !== 'undefined' && LearnerContext.forSocraticTutor)
      ? LearnerContext.forSocraticTutor(node, this.mode.example)
      : 'WORKED EXAMPLE: ' + (this.mode.example.title || '') + '\n' + (this.mode.example.question || '');
    let examStyle = '';
    try {
      const k = 'kn_exam_style_' + (node.subject || '').toLowerCase().replace(/\s+/g, '_');
      const d = JSON.parse(localStorage.getItem(k) || 'null');
      if (d?.papers?.length) {
        const p = d.papers[d.papers.length - 1];
        examStyle = '\nThe student\'s exam style: ' + (p.analysis?.style || '') + ' — types: ' + (p.analysis?.questionTypes || []).join(', ');
      }
    } catch (e) {}
    return ctx + examStyle
      + '\n\nYou are having a REAL CONVERSATION with the student about the worked example above — read what they actually say each turn and respond to THAT. If they attempt an answer, mark it kindly and specifically. If they are stuck, hint or simplify — never hand over the full answer unprompted. Teach only from their material; outside-knowledge methods only when asked, flagged "this isn\'t in your notes". Be concise and warm; plain text only, maths in plain symbols.'
      + '\nYou MAY end with these control tags on their own lines (hidden from the student):'
      + '\n[[CHIPS: short tap option | another | another]]  (2-4 genuinely useful next-tap suggestions for THIS moment)'
      + '\n[[PHASE: n]]  (n = 1-5: 1 orient, 2 understand, 3 practise, 4 exam-style, 5 wrapping up)'
      + '\n[[DONE]]  (only when the student has clearly succeeded and wants to stop)';
  },

  /* ─── node-graph operations ─── */

  /** Advance the tutor to the next question; returns false when the set is done. */
  tutorAdvance() {
    if (this.mode.kind !== 'tutor') return false;
    const node = nodeStore.get(this.mode.nodeId);
    const qs = node ? (node.questions || []) : [];
    if (this.mode.i + 1 >= qs.length) { this.end(); return false; }
    this.mode.i++;
    return true;
  },

  /** Programmatic UPDATE of the active Revision Questions node: record how the
   *  student did on the current question — feeds SRS scheduling, mastery, and
   *  the "Review in your textbook" list. */
  recordOutcome(gotIt) {
    if (this.mode.kind !== 'tutor') return false;
    const node = nodeStore.get(this.mode.nodeId);
    const q = node ? (node.questions || [])[this.mode.i] : null;
    if (!node || !q) return false;
    try {
      node.recordRating(q.id, gotIt ? 3 : 1);
      if (!gotIt && typeof LearnerMemory !== 'undefined') LearnerMemory.recordStruggle(node, q, 1);
      nodeStore.save(node);
      return true;
    } catch (e) { console.warn('[CoachEngine] recordOutcome failed:', e); return false; }
  },

  /** Programmatically compile a linked Revision Questions node from an
   *  EXISTING source node's saved material — no re-upload, no manual steps. */
  async compileQuestionsNode(sourceNodeId) {
    const src = nodeStore.get(sourceNodeId);
    if (!src) throw new Error('Topic not found.');
    const notes = {
      title:       src.title,
      definitions: src.definitions || [],
      formulas:    src.formulas    || [],
      procedures:  src.procedures  || [],
      tables:      src.tables      || [],
      summary:     src.summary || (src.userNotes || src.rawOCR || '').slice(0, 500),
    };
    const meta  = { subject: src.subject, chapter: src.chapter, detail: 'standard', profile: src.learnerProfile };
    const qData = await AIService._generateQuestions(notes, meta, src.subjectCategory || 'general');
    const questions = [
      ...(qData.recall || []).map(q => ({ id: KnowledgeNode._generateQuestionId(), type: 'recall', question: q.question, answer: q.answer, accept: Array.isArray(q.accept) ? q.accept.filter(a => typeof a === 'string').slice(0, 6) : [] })),
      ...(qData.application || []).map(q => ({ id: KnowledgeNode._generateQuestionId(), type: 'application', question: q.question, answer: q.answer })),
    ];
    if (!questions.length) throw new Error('No questions came back — try again.');
    const qNode = new KnowledgeNode({
      subject: src.subject, chapter: src.chapter,
      title: src.title + ' — Revision Questions',
      questions, linkedSourceId: src.id, processingStatus: 'ready',
    });
    nodeStore.save(qNode);
    try { if (typeof StreakTracker !== 'undefined') StreakTracker.recordActivity(); } catch (e) {}
    return qNode;
  },
};
if (typeof window !== 'undefined') window.CoachEngine = CoachEngine;
