/**
 * SpacedRepetition.js — FSRS scheduler (Free Spaced Repetition Scheduler, v4.5)
 *
 * Upgraded from SM-2. FSRS models each card's actual forgetting curve with two
 * memory variables — stability S (days until recall probability drops to 90%)
 * and difficulty D (1–10) — and schedules the next review for when recall is
 * predicted to hit the 90% target. Same retention as SM-2 with roughly 20-30%
 * fewer reviews. Default parameters from the open FSRS-4.5 release.
 *
 * Rating scale (unchanged): 1=Again, 2=Hard, 3=Good, 4=Easy
 *
 * Compatibility: cards keep the legacy fields (`ease`, `interval`,
 * `repetitions`, `nextReview`) alongside the FSRS state (`stability`,
 * `difficulty`, `lapses`, `lastReview`) — Dashboard, Review and the mastery
 * calculator read the legacy fields. Existing SM-2 cards migrate on their
 * next rating: stability seeds from the current interval, difficulty from
 * ease. `repetitions` is no longer reset on a lapse (FSRS tracks `lapses`
 * separately) — a forgotten card is not a "new" card.
 *
 * Reference: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
 */

const SpacedRepetition = {
  // FSRS-4.5 default weights
  _W: [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031,
       1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755],
  _DECAY: -0.5,
  _FACTOR: 19 / 81,
  REQUEST_RETENTION: 0.9,   // schedule reviews at predicted 90% recall
  MAX_INTERVAL: 365,

  /** Predicted recall probability after `elapsedDays` for a card of stability S. */
  retrievability(elapsedDays, stability) {
    if (!(stability > 0)) return 0;
    return Math.pow(1 + this._FACTOR * Math.max(0, elapsedDays) / stability, this._DECAY);
  },

  _clampD(d) { return Math.min(10, Math.max(1, d)); },
  _initS(g)  { return Math.max(0.1, this._W[g - 1]); },
  _initD(g)  { return this._clampD(this._W[4] - (g - 3) * this._W[5]); },

  _nextD(d, g) {
    const w = this._W;
    const next = d - w[6] * (g - 3);
    return this._clampD(w[7] * this._initD(4) + (1 - w[7]) * next);   // mean reversion
  },

  _nextSSuccess(d, s, r, g) {
    const w = this._W;
    const hard = g === 2 ? w[15] : 1;
    const easy = g === 4 ? w[16] : 1;
    return s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9])
                  * (Math.exp((1 - r) * w[10]) - 1) * hard * easy);
  },

  _nextSForget(d, s, r) {
    const w = this._W;
    const ns = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]);
    return Math.min(ns, s);   // forgetting never increases stability
  },

  _intervalFor(stability) {
    const days = (stability / this._FACTOR) * (Math.pow(this.REQUEST_RETENTION, 1 / this._DECAY) - 1);
    return Math.min(this.MAX_INTERVAL, Math.max(1, Math.round(days)));
  },

  /**
   * Update a card's SRS state based on a rating.
   * @param {object} card
   * @param {1|2|3|4} rating
   * @returns {object} Updated card (new object)
   */
  update(card, rating) {
    const g = [1, 2, 3, 4].includes(rating) ? rating : 3;
    const now = Date.now();
    let { stability, difficulty } = card;
    let repetitions = Math.max(0, card.repetitions || 0);
    let lapses = Math.max(0, card.lapses || 0);

    if (!(stability > 0)) {
      if (repetitions > 0 && card.interval > 0) {
        // Migrating a card that lived under SM-2: interval ≈ stability,
        // ease 2.5→D≈2 (easy) … ease 1.3→D=10 (leech).
        stability  = Math.max(0.5, card.interval);
        difficulty = this._clampD(11 - ((card.ease || 2.5) - 1.3) * (9 / 1.2));
        const elapsed = card.nextReview ? Math.max(0, (now - (card.nextReview - card.interval * 86400000)) / 86400000) : card.interval;
        const r = this.retrievability(elapsed, stability);
        difficulty = this._nextD(difficulty, g);
        stability  = g === 1 ? this._nextSForget(difficulty, stability, r)
                             : this._nextSSuccess(difficulty, stability, r, g);
      } else {
        // Brand-new card: first rating seeds the memory state
        stability  = this._initS(g);
        difficulty = this._initD(g);
      }
    } else {
      const elapsed = card.lastReview ? (now - card.lastReview) / 86400000 : (card.interval || 0);
      const r = this.retrievability(elapsed, stability);
      difficulty = this._nextD(difficulty, g);
      stability  = g === 1 ? this._nextSForget(difficulty, stability, r)
                           : this._nextSSuccess(difficulty, stability, r, g);
    }

    if (g === 1) lapses += 1;
    // Durability guard: mastery is built on `repetitions` (≈4 spaced successes
    // → mastered), so re-rating a card within the same sitting must NOT count
    // as another rep — otherwise tapping through a question 4× in one session
    // farms 100% mastery, breaking the promise that mastery "builds over days,
    // not in one sitting". Scheduling (stability/difficulty) still updates on
    // every rating; only the durability counter is gated. The first-ever
    // rating always counts.
    const sinceLast = card.lastReview ? (now - card.lastReview) : Infinity;
    if (sinceLast >= 12 * 3600000) repetitions += 1;

    const interval   = g === 1 ? 1 : this._intervalFor(stability);   // relearn tomorrow
    const nextReview = now + interval * 86400000;
    // Legacy compat: mastery reads `ease` as an inverse-difficulty signal
    const ease = 1.3 + ((10 - difficulty) / 9) * 1.2;

    return { stability, difficulty, ease, interval, repetitions, lapses, nextReview, lastReview: now };
  },

  /**
   * Get all due question-node pairs for a review session.
   * @param {KnowledgeNode[]} nodes
   * @returns {{ node: KnowledgeNode, question: object, state: object|null }[]}
   */
  buildSession(nodes) {
    const now = Date.now();
    const items = [];

    nodes.forEach(node => {
      node.questions.forEach(q => {
        const state = node.srsState[q.id] || null;
        const isDue = !state || state.nextReview <= now;
        if (isDue) {
          items.push({ node, question: q, state });
        }
      });
    });

    // Shuffle
    return SpacedRepetition._shuffle(items);
  },

  /**
   * Prioritize new cards and overdue first, then by how overdue they are.
   * @param {KnowledgeNode[]} nodes
   */
  buildPrioritizedSession(nodes) {
    const now = Date.now();
    const items = SpacedRepetition.buildSession(nodes);

    return items.sort((a, b) => {
      const aOverdue = !a.state ? -Infinity : a.state.nextReview - now;
      const bOverdue = !b.state ? -Infinity : b.state.nextReview - now;
      return aOverdue - bOverdue;   // most overdue first
    });
  },

  /** Fisher-Yates shuffle */
  _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  /**
   * Days until next review for a card.
   */
  daysUntil(state) {
    if (!state) return 0;
    const ms = state.nextReview - Date.now();
    return Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
  },

  /**
   * Human-readable interval label.
   */
  intervalLabel(state) {
    if (!state || state.repetitions === 0) return 'New';
    const days = SpacedRepetition.daysUntil(state);
    if (days === 0) return 'Due today';
    if (days === 1) return 'Tomorrow';
    if (days < 7) return `${days} days`;
    if (days < 30) return `${Math.round(days / 7)}w`;
    return `${Math.round(days / 30)}mo`;
  },
};
