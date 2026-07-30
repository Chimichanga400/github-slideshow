/**
 * QuestionKind.js — tell a quick recall question apart from a full worked
 * calculation. Free, on-device, zero dependencies.
 *
 * Imported worksheets arrive with everything typed 'recall', so a ten-minute
 * multi-part computation ("Chris, whose age next birthday will be 65, donated a
 * usufructuary interest… Calculate the donations tax payable") was scheduled as
 * a flashcard. That does not work: nobody works a usufruct valuation on their
 * phone between two other cards, so it gets skipped and rated Again, which
 * makes the interval meaningless and eventually trips the leech detector on a
 * question the student never actually attempted.
 *
 * Spaced repetition is for fast retrieval. Full calculations belong in the exam,
 * sat properly and marked at the end. This decides which is which so each goes
 * where it works.
 *
 * Deliberately biased toward 'recall': a question is only treated as a
 * calculation on CLEAR evidence, because wrongly hiding a legitimate recall card
 * from review costs the student real practice.
 */
const QuestionKind = {
  /** An explicit instruction to compute something. */
  _DO: /\b(calculate|compute|determine the (?:amount|tax|value|total)|work out|how much (?:tax|is|would|must))\b/i,
  /** Scenario scaffolding — the long story a computation hangs off. */
  _STORY: /\b(aged \d|age next birthday|during the (?:current |)year of assessment|financial year|the following (?:information|transactions)|assume that)\b/i,
  /** An amount: R 3 250 000 / R36 000 / 1,250.50 */
  _MONEY: /(?:^|[^\w])(?:r\s?)?\d{1,3}(?:[ ,]\d{3})+(?:\.\d+)?|\br\s?\d+(?:\.\d{2})?\b/i,

  /**
   * @param {{question?:string, answer?:string, type?:string}} q
   * @returns {'calculation'|'recall'}
   */
  of(q) {
    if (!q) return 'recall';
    const text = String(q.question || '');
    const ans  = String(q.answer || '');
    if (!text.trim()) return 'recall';

    // A lettered multiple-choice question is always quick, whatever it asks
    // about — the student picks an option, they do not compute anything.
    if (typeof MatchOptions !== 'undefined' && MatchOptions.parse && MatchOptions.parse(text)) return 'recall';

    let score = 0;
    if (this._DO.test(text))                       score += 2;   // "Calculate the…"
    if (this._STORY.test(text))                    score += 1;   // scenario setup
    if ((text.match(this._MONEY) || []).length)    score += 1;   // amounts in the question
    if (text.length > 260)                         score += 1;   // long by any measure
    if (text.length > 500)                         score += 1;
    // A model answer laid out as workings (several lines, or lines with "=") is
    // the strongest signal of all: the answer is a method, not a fact.
    const lines = ans.split('\n').filter(l => l.trim()).length;
    if (lines >= 3)                                score += 2;
    if (/=/.test(ans) && this._MONEY.test(ans))    score += 1;

    return score >= 3 ? 'calculation' : 'recall';
  },

  /** Should this question appear in spaced repetition? */
  isReviewable(q) { return this.of(q) !== 'calculation'; },

  /** Split a question list into the two streams. */
  split(questions) {
    const recall = [], calculation = [];
    (questions || []).forEach(q => (this.of(q) === 'calculation' ? calculation : recall).push(q));
    return { recall, calculation };
  },
};
if (typeof window !== 'undefined') window.QuestionKind = QuestionKind;
if (typeof module !== 'undefined' && module.exports) module.exports = QuestionKind;
