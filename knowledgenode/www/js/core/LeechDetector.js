/**
 * LeechDetector.js — spots "leech" cards and breaks the grind (on-device, free).
 *
 * A leech is a question the learner keeps failing — flashcarding it again and
 * again wastes time, because the problem is usually that the underlying CONCEPT
 * isn't understood, not that the fact hasn't been drilled enough. Endlessly
 * re-testing a blank is the single biggest time-sink in flashcard study.
 *
 * This module detects a leech from the existing struggle log (weakQuestions[].
 * count, maintained by LearnerMemory.recordStruggle) and lets Review intervene:
 * stop re-queuing the card this session and offer to actually learn it. No new
 * data, no AI, no network.
 */
const LeechDetector = {
  THRESHOLD: 4,   // failed/struggled this many times → treat as a leech

  /** Struggle count for a specific question on a node (0 if never struggled). */
  countFor(node, questionId) {
    const w = (node && node.weakQuestions || []).find(w => w.id === questionId);
    return w ? (w.count || 0) : 0;
  },

  /** Is this struggle record (or raw count) at/over the leech threshold? */
  isLeech(struggleOrCount) {
    const c = typeof struggleOrCount === 'number'
      ? struggleOrCount
      : (struggleOrCount && struggleOrCount.count) || 0;
    return c >= this.THRESHOLD;
  },

  /** Has this specific card become a leech? */
  isLeechCard(node, questionId) {
    return this.isLeech(this.countFor(node, questionId));
  },

  /** Every leech across the library, worst-struggled first. */
  leeches(nodes) {
    const out = [];
    (nodes || []).forEach(n => (n.weakQuestions || []).forEach(w => {
      if (this.isLeech(w)) {
        const q = (n.questions || []).find(q => q.id === w.id);
        if (q) out.push({ node: n, question: q, count: w.count || 0 });
      }
    }));
    return out.sort((a, b) => b.count - a.count);
  },
};
if (typeof window !== 'undefined') window.LeechDetector = LeechDetector;
if (typeof module !== 'undefined' && module.exports) module.exports = LeechDetector;
