/**
 * LocalGrader.js — free, on-device first pass for answer checking.
 *
 * Before spending AI credits (or when offline), the student's answer is
 * compared against the question's stored acceptable answers. The matcher is
 * deliberately CONSERVATIVE: it only ever returns 'correct' (high-confidence
 * match) or 'unknown' — never 'incorrect'. A wrong-looking answer might still
 * be right in words the matcher can't see, so anything unclear goes to the AI
 * (online) or to self-marking (offline). Zero dependencies.
 */
const LocalGrader = {
  _STOP: new Set(['the','a','an','of','to','in','on','for','and','or','is','are','was','were',
    'be','it','its','this','that','as','at','by','with','from','equals','equal']),

  /** Lowercase, strip accents/punctuation, collapse whitespace. */
  normalize(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[’'`´]/g, '')
      .replace(/[^a-z0-9.%\-\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  _tokens(s) {
    return this.normalize(s).split(' ').filter(t => t.length > 1 && !this._STOP.has(t));
  },

  _num(s) {
    // Collapse thousands separators BEFORE extracting numbers. This app is full
    // of amounts like "R 100 000" / "R1 385 600" / "100,000"; normalize() turns
    // commas into spaces, so a space (or comma) sitting between two digits is a
    // grouping separator, not a boundary between two numbers. Join those digit
    // groups so "R 100 000" reads as 100000, not [100, 0]. Loop until stable to
    // handle multi-group amounts ("1 000 000").
    let t = this.normalize(s), prev;
    do { prev = t; t = t.replace(/(\d)[ ,](\d)/g, '$1$2'); } while (t !== prev);
    const m = t.match(/-?\d+(?:\.\d+)?%?/g);
    return m ? m.map(x => x.endsWith('%') ? parseFloat(x) / 100 : parseFloat(x)) : [];
  },

  /**
   * Match a student answer against acceptable answers.
   * @param {string} student
   * @param {string[]|string} accepted - model answer + any stored variants
   * @returns {{verdict:'correct'|'unknown', matched?:string}}
   */
  match(student, accepted) {
    const list = (Array.isArray(accepted) ? accepted : [accepted]).filter(Boolean);
    const sNorm = this.normalize(student);
    if (!sNorm) return { verdict: 'unknown' };

    for (const acc of list) {
      const aNorm = this.normalize(acc);
      if (!aNorm) continue;

      // 1. Exact match after normalisation
      if (sNorm === aNorm) return { verdict: 'correct', matched: acc };

      // 2. Short accepted answer (a term) contained whole in the student's answer
      //    e.g. accepted "asset", student "I think it's an asset"
      if (aNorm.length <= 40 && (' ' + sNorm + ' ').includes(' ' + aNorm + ' '))
        return { verdict: 'correct', matched: acc };

      // 3. Pure numeric answers: same numbers in the same order
      const aNums = this._num(acc), sNums = this._num(student);
      const aTok = this._tokens(acc);
      if (aNums.length && aNums.length === sNums.length
          && aNums.every((n, i) => Math.abs(n - sNums[i]) < 1e-9)
          && aTok.length <= 2)
        return { verdict: 'correct', matched: acc };

      // 4. Key-token coverage: every meaningful word of a short accepted answer
      //    appears in the student's answer (handles reordering: "Assets less
      //    Liabilities" vs "assets minus liabilities" won't pass — 'less' vs
      //    'minus' differ — but "owner's equity = assets - liabilities" vs
      //    "Assets less Liabilities equals owners equity" shares the key nouns).
      if (aTok.length >= 2 && aTok.length <= 8) {
        const sSet = new Set(this._tokens(student));
        if (aTok.every(t => sSet.has(t))) return { verdict: 'correct', matched: acc };
      }

      // 5. Multiple-choice: imported revision questions store answers as
      //    "A — full option text". Answering with just that letter — "A",
      //    "a)", "option A", "it's A" — is a confident match, so drilling
      //    MCQs never needs an AI call. The accepted answer must have an
      //    explicit letter+separator shape ("A —", "B)", "C:", "D.") so a
      //    sentence that merely STARTS with the word "A" can never trigger it.
      const mcq = String(acc).match(/^\s*\(?([A-Fa-f])\)?\s*[—–\-:.)]\s*\S/);
      if (mcq) {
        const sm = sNorm.match(/^(?:i think )?(?:its |the )?(?:answer |option |choice )?(?:is )?([a-f])\.?$/);
        if (sm && sm[1] === mcq[1].toLowerCase()) return { verdict: 'correct', matched: acc };
      }
    }
    return { verdict: 'unknown' };
  },

  /** Acceptable-answer list for a question object ({answer, accept?}). */
  acceptedFor(q) {
    const out = [q && q.answer];
    if (q && Array.isArray(q.accept)) out.push(...q.accept.filter(a => typeof a === 'string'));
    return out.filter(Boolean);
  },
};
if (typeof window !== 'undefined') window.LocalGrader = LocalGrader;
if (typeof module !== 'undefined' && module.exports) module.exports = LocalGrader;
