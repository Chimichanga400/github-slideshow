/**
 * NewCardPacer.js — daily new-card introduction limit (on-device, free).
 *
 * Spaced repetition only works if NEW material is introduced at a sustainable
 * rate. Uploading 200 questions creates 200 "new" cards; drilling all of them
 * in one sitting is cognitive overload — the exact anti-pattern SRS exists to
 * prevent. This paces new cards into the daily review flow: a capped batch is
 * mixed in alongside due reviews, so a big upload becomes a steady drip.
 *
 * The budget adapts to the student's session-load lever (light/normal/deep),
 * and is tracked per calendar day so starting several sessions in one day
 * cannot smuggle the whole pile in at once. A card counts as "introduced" when
 * it receives its FIRST rating (repetitions 0 → 1), mirroring how Anki counts.
 */
const NewCardPacer = {
  _BUDGET: { light: 6, normal: 12, deep: 24 },
  _PREFIX: 'kn_newcards_',

  _today() { return new Date().toISOString().slice(0, 10); },
  _key()   { return this._PREFIX + this._today(); },

  /** New cards allowed per day for a given load level. */
  budget(level) { return this._BUDGET[level] || this._BUDGET.normal; },

  /** How many new cards have already been introduced today. */
  introducedToday() {
    try { return parseInt(localStorage.getItem(this._key()) || '0', 10) || 0; }
    catch (e) { return 0; }
  },

  /** How many new cards may still be introduced today at this load level. */
  remainingToday(level) {
    return Math.max(0, this.budget(level) - this.introducedToday());
  },

  /** Count `n` newly-introduced cards against today's budget. Prunes stale
   *  day-keys so localStorage doesn't grow without bound. */
  recordIntroduced(n = 1) {
    try {
      const key = this._key();
      localStorage.setItem(key, String(this.introducedToday() + Math.max(0, n)));
      // Prune any previous days' counters.
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(this._PREFIX) && k !== key) { localStorage.removeItem(k); i--; }
      }
    } catch (e) { /* non-critical */ }
  },
};
if (typeof window !== 'undefined') window.NewCardPacer = NewCardPacer;
if (typeof module !== 'undefined' && module.exports) module.exports = NewCardPacer;
