/**
 * MatchGroup.js — reassemble a real "Match & Pair" exercise from the individual
 * questions an import produced. Free, on-device, zero dependencies.
 *
 * A matching worksheet ("Match the items in COLUMN A with those in COLUMN B")
 * is extracted as ONE question per Column-A item, each carrying the SAME shared
 * list of lettered Column-B options and its own correct letter as the answer.
 * Shown one at a time that is just a slow MCQ. detect() groups the siblings
 * back together — same node, identical option list — so the exam can present
 * the whole thing as the two-column matching table the student actually sees on
 * paper, and mark every pair instantly for free (a wrong match is definitively
 * wrong — no AI needed).
 */
const MatchGroup = {
  _INSTR: /\b(match|column)\b/i,

  _mo() {
    if (typeof window !== 'undefined' && window.MatchOptions) return window.MatchOptions;
    if (typeof require !== 'undefined') { try { return require('./MatchOptions.js'); } catch (e) {} }
    return null;
  },

  /** Separate the generic "Match … Column …" instruction from the actual
   *  numbered Column-A prompt, so the instruction shows once (as a heading) and
   *  each row shows only its own item. */
  _splitStem(stem) {
    const lines = String(stem == null ? '' : stem).split('\n').map(s => s.trim()).filter(Boolean);
    const instr = [], prompt = [];
    for (const l of lines) {
      if (this._INSTR.test(l) && prompt.length === 0) instr.push(l);
      else prompt.push(l);
    }
    return { instruction: instr.join(' '), prompt: prompt.join(' ') };
  },

  /** A stable fingerprint of an option set, so siblings that share it group. */
  signature(options) {
    return (options || []).map(o => o.letter + '|' + String(o.text).toLowerCase().replace(/\s+/g, ' ').trim()).join('§');
  },

  /**
   * Find matching groups inside one node.
   * @returns {{key,instruction,options,prompts:{q,prompt,answer}[]}[]}
   *          Only genuine sets (≥2 items sharing an identical ≥3-option list).
   */
  detect(node) {
    const MO = this._mo();
    if (!MO || !node || !Array.isArray(node.questions)) return [];
    const bySig = new Map();
    for (const it of node.questions) {
      const p = MO.parse(it.question);
      if (!p || p.options.length < 3) continue;
      const sig = this.signature(p.options);
      const st = this._splitStem(p.stem);
      if (!bySig.has(sig)) bySig.set(sig, { key: (node.id || 'n') + '::' + sig, instruction: '', options: p.options, prompts: [] });
      const g = bySig.get(sig);
      if (!g.instruction && st.instruction) g.instruction = st.instruction;
      g.prompts.push({ q: it, prompt: st.prompt || it.question, answer: it.answer || '' });
    }
    return [...bySig.values()].filter(g => g.prompts.length >= 2);
  },

  /** The full "LETTER — text" to store when a letter is assigned to a prompt. */
  answerFor(group, letter) {
    if (!group) return letter;
    const o = group.options.find(x => x.letter === String(letter).toUpperCase());
    return o ? o.raw : String(letter).toUpperCase();
  },

  /** Which letter is the correct match for a prompt (from its stored answer). */
  correctLetter(group, answer) {
    const MO = this._mo();
    return (MO && MO.letterOf) ? MO.letterOf({ options: group.options }, answer) : null;
  },

  /** Map a node's question-id → the group it belongs to (for session building). */
  indexByQuestion(node) {
    const map = new Map();
    for (const g of this.detect(node)) for (const p of g.prompts) map.set(p.q.id, g);
    return map;
  },
};
if (typeof window !== 'undefined') window.MatchGroup = MatchGroup;
if (typeof module !== 'undefined' && module.exports) module.exports = MatchGroup;
