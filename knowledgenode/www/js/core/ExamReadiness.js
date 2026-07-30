/**
 * ExamReadiness.js — evidence-based "how ready am I, and what should I do
 * next?" — computed entirely on-device (no API calls) from data the app
 * already stores.
 *
 * Readiness is NOT just average mastery. A student can show 80% mastery while
 * half their topics are untouched, or while their reviews have gone stale. The
 * score blends four signals, each 0..1:
 *
 *   coverage   — how much of the material has genuinely been started (a topic
 *                with no questions, or whose questions were never reviewed,
 *                counts as not-yet-covered). You cannot be "ready" on material
 *                you have not begun.
 *   mastery    — average mastery across topics (the durable, spaced-review
 *                signal from computeMastery()).
 *   retention  — of the cards that are scheduled, how many are NOT overdue.
 *                Overdue cards have likely decayed, so a pile of overdue work
 *                lowers real readiness even if stored mastery looks high.
 *   alignment  — when past papers have been analysed, how well the topics the
 *                examiner actually tests are covered by high-mastery nodes.
 *                Absent past papers, this signal is omitted (not penalised).
 *
 * The engine also returns a PRIORITISED action list — the fewest, highest-
 * leverage moves to raise readiness fastest — each with an estimated lift so
 * the UI can order and justify them.
 */
const ExamReadiness = {
  _MASTERED: 70,          // a topic at/above this is "solid"
  _STARTED_REPS: 1,       // a question with >=1 review counts as started

  /** Full assessment. `nodes` = ready KnowledgeNodes; `plan` optional (for
   *  the exam countdown only — readiness is computed with or without it). */
  assess(nodes, plan) {
    const ready = (nodes || []).filter(n => n && (n.processingStatus === 'ready' || n.processingStatus === undefined));
    const daysToExam = (plan && (plan.daysRemaining != null ? plan.daysRemaining
                        : (typeof plan.daysUntilExam === 'function' ? plan.daysUntilExam() : plan.daysUntilExam))) ?? null;

    if (!ready.length) {
      return { score: 0, band: this._band(0), daysToExam, hasData: false,
        signals: { coverage: 0, mastery: 0, retention: 1, alignment: null },
        actions: [{ text: 'Add your first topic — upload notes or revision questions to start.', lift: 0, kind: 'add' }] };
    }

    const now = Date.now();
    let started = 0, masterySum = 0, dueTotal = 0, dueOverdue = 0, weakLoad = 0;
    const unstarted = [], overdueTopics = [], weakTopics = [];

    ready.forEach(n => {
      const qs = n.questions || [];
      const reviewed = qs.filter(q => { const s = n.srsState && n.srsState[q.id]; return s && (s.repetitions || 0) >= this._STARTED_REPS; });
      const isStarted = reviewed.length > 0;
      if (isStarted) started++; else unstarted.push(n);
      masterySum += (n.masteryScore || 0);

      let topicOverdue = 0;
      qs.forEach(q => {
        const s = n.srsState && n.srsState[q.id];
        if (s && (s.repetitions || 0) > 0) {
          dueTotal++;
          if (s.nextReview && s.nextReview <= now) { dueOverdue++; topicOverdue++; }
        }
      });
      if (topicOverdue > 0) overdueTopics.push({ node: n, count: topicOverdue });

      const weak = (typeof n.missedQuestionsForReview === 'function') ? n.missedQuestionsForReview(50) : [];
      if (weak.length) { weakLoad += weak.length; weakTopics.push({ node: n, count: weak.length }); }
    });

    const coverage  = started / ready.length;
    const mastery   = (masterySum / ready.length) / 100;
    const retention = dueTotal ? (1 - dueOverdue / dueTotal) : 1;
    const alignment = this._alignment(ready);

    // Weighted blend. Alignment folds in only when past papers exist.
    let score, wSum;
    if (alignment == null) {
      score = 0.45 * mastery + 0.30 * coverage + 0.25 * retention;
      wSum  = 1;
    } else {
      score = 0.38 * mastery + 0.25 * coverage + 0.20 * retention + 0.17 * alignment;
      wSum  = 1;
    }
    const pct = Math.round(Math.min(1, Math.max(0, score / wSum)) * 100);

    return {
      score: pct, band: this._band(pct), daysToExam, hasData: true,
      signals: {
        coverage:  Math.round(coverage * 100),
        mastery:   Math.round(mastery * 100),
        retention: Math.round(retention * 100),
        alignment: alignment == null ? null : Math.round(alignment * 100),
      },
      actions: this._actions({ ready, unstarted, overdueTopics, weakTopics, dueOverdue, weakLoad, pct }),
    };
  },

  /** Examiner-topic alignment: of the examiner's topic areas across analysed
   *  past papers, how many are covered by a solid (>= _MASTERED) node in the
   *  same subject. Returns null when no past papers exist. */
  _alignment(nodes) {
    let examTopics = [], anyPaper = false;
    const subjects = [...new Set(nodes.map(n => n.subject).filter(Boolean))];
    for (const s of subjects) {
      try {
        const raw = localStorage.getItem('kn_exam_style_' + s.toLowerCase().replace(/\s+/g, '_'));
        if (!raw) continue;
        const papers = (JSON.parse(raw).papers || []);
        if (!papers.length) continue;
        anyPaper = true;
        papers.forEach(p => (p.analysis && p.analysis.topicAreas || []).forEach(t => examTopics.push({ subject: s.toLowerCase(), topic: String(t).toLowerCase() })));
      } catch (e) { /* ignore */ }
    }
    if (!anyPaper || !examTopics.length) return null;
    let covered = 0;
    examTopics.forEach(({ subject, topic }) => {
      const hit = nodes.some(n => (n.subject || '').toLowerCase() === subject
        && (n.masteryScore || 0) >= this._MASTERED
        && ((n.title || '').toLowerCase().includes(topic) || topic.includes((n.title || '').toLowerCase()) || (n.summary || '').toLowerCase().includes(topic)));
      if (hit) covered++;
    });
    return covered / examTopics.length;
  },

  /** Prioritised, concrete next moves — ordered by estimated readiness lift. */
  _actions({ ready, unstarted, overdueTopics, weakTopics, dueOverdue, weakLoad, pct }) {
    const acts = [];

    if (unstarted.length) {
      const names = unstarted.slice(0, 3).map(n => n.title).join(', ');
      acts.push({
        kind: 'start',
        text: 'Start ' + unstarted.length + ' topic' + (unstarted.length === 1 ? '' : 's') + ' you haven\'t begun' + (names ? ': ' + names + (unstarted.length > 3 ? '…' : '') : '') + '.',
        lift: Math.round((unstarted.length / ready.length) * 30),
        nodeId: unstarted[0].id,
      });
    }
    if (dueOverdue > 0) {
      acts.push({
        kind: 'review',
        text: 'Clear ' + dueOverdue + ' overdue review' + (dueOverdue === 1 ? '' : 's') + ' before that knowledge decays.',
        lift: Math.min(20, dueOverdue),
      });
    }
    // Leeches: cards failed so often that drilling them again is wasted time —
    // they need concept work, not more testing. High leverage: a persistent
    // blocker removed is worth more than another ordinary review.
    const leeches = (typeof LeechDetector !== 'undefined') ? LeechDetector.leeches(ready) : [];
    if (leeches.length) {
      acts.push({
        kind: 'leech',
        text: leeches.length + ' question' + (leeches.length === 1 ? ' you keep missing needs' : 's you keep missing need') + ' understanding, not drilling'
          + ' — start with "' + leeches[0].node.title + '".',
        lift: Math.min(22, 6 + leeches.length * 3),
        nodeId: leeches[0].node.id,
      });
    }
    if (weakLoad > 0) {
      const t = weakTopics.sort((a, b) => b.count - a.count)[0];
      acts.push({
        kind: 'drill',
        text: 'Drill your ' + weakLoad + ' weakest question' + (weakLoad === 1 ? '' : 's')
          + (t ? ' — start with "' + t.node.title + '"' : '') + ' (see each topic\'s Mastery → "Review in your textbook").',
        lift: Math.min(18, weakLoad * 2),
        nodeId: t ? t.node.id : undefined,
      });
    }
    // Lowest-mastery started topic that isn't already flagged as weak/overdue.
    const flagged = new Set([...overdueTopics, ...weakTopics].map(x => x.node.id));
    const lowMastery = ready
      .filter(n => !flagged.has(n.id) && (n.questions || []).some(q => n.srsState && n.srsState[q.id]) && (n.masteryScore || 0) < this._MASTERED)
      .sort((a, b) => (a.masteryScore || 0) - (b.masteryScore || 0))[0];
    if (lowMastery) {
      acts.push({
        kind: 'strengthen',
        text: 'Strengthen "' + lowMastery.title + '" — it\'s at ' + (lowMastery.masteryScore || 0) + '% and needs a few more spaced reviews.',
        lift: Math.round((this._MASTERED - (lowMastery.masteryScore || 0)) / 6),
        nodeId: lowMastery.id,
      });
    }

    if (!acts.length) {
      acts.push({
        kind: 'maintain',
        text: pct >= 85 ? 'You\'re exam-ready. Keep your daily reviews ticking so nothing goes stale.'
                        : 'Keep going — do today\'s reviews and a short practice session.',
        lift: 0,
      });
    }
    return acts.sort((a, b) => (b.lift || 0) - (a.lift || 0)).slice(0, 4);
  },

  _band(pct) {
    if (pct >= 85) return { key: 'ready',    label: 'Exam ready',    tone: 'good' };
    if (pct >= 65) return { key: 'ontrack',  label: 'On track',      tone: 'good' };
    if (pct >= 40) return { key: 'building', label: 'Building up',    tone: 'mid'  };
    return               { key: 'early',    label: 'Getting started', tone: 'low'  };
  },
};
if (typeof window !== 'undefined') window.ExamReadiness = ExamReadiness;
if (typeof module !== 'undefined' && module.exports) module.exports = ExamReadiness;
