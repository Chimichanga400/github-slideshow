/**
 * CompetencyView.js — Subject competency test + effectiveness report
 *
 * Three combined formats:
 *  1. Timed Quiz — mock exam with a countdown timer
 *  2. AI Graded  — open-answer questions graded by AI with detailed feedback
 *  3. Report Card — visual strengths vs gaps across all subjects
 */

const CompetencyView = {
  _mode: 'report',       // 'report'|'timed'|'ai-quiz'
  _subject: 'all',
  _session: [],          // questions for current test
  _idx: 0,
  _answers: [],
  _timer: null,
  _timeLeft: 0,
  _started: false,

  init() { /* called from app.js */ },

  /** Entry point used by Study Plan / Dashboard "🏆 Test" buttons.
   *  Navigates to the competency view with a subject preselected and shows
   *  the report card scoped to that subject. The user can then run a timed
   *  quiz or AI exam from the mode buttons. */
  open(subject, mode) {
    this._subject = subject || 'all';
    this._mode    = mode || 'report';
    if (typeof App !== 'undefined' && App.navigateTo) App.navigateTo('competency');
    else this.refresh(); // fallback if router unavailable
    try {
      const nodes = nodeStore.getAll().filter(n => n.processingStatus === 'ready');
      const filtered = this._subject === 'all' ? nodes : nodes.filter(n => n.subject === this._subject);
      if (!filtered.length) { Toast.error('No notes found for this subject yet.'); return; }
      if (this._mode === 'report') this._showReport(filtered, nodes);
    } catch (e) {
      console.error('CompetencyView.open failed:', e);
    }
  },

  refresh() {
    const nodes = nodeStore.getAll().filter(n => n.processingStatus === 'ready');
    this._renderShell(nodes);
  },

  _renderShell(nodes) {
    const container = document.getElementById('competency-body');
    if (!container) return;

    const subjects = [...new Set(nodes.map(n=>n.subject).filter(Boolean))];
    const subjectOptions = ['all', ...subjects].map(s =>
      `<option value="${s}" ${s===this._subject?'selected':''}>${s==='all'?'All Subjects':s}</option>`
    ).join('');

    container.innerHTML = `
      <!-- Mode selector -->
      <div class="competency-modes">
        <button class="comp-mode-btn ${this._mode==='report'?'active':''}"  data-mode="report">📊 Report Card</button>
        <button class="comp-mode-btn ${this._mode==='timed'?'active':''}"   data-mode="timed">⏱ Timed Quiz</button>
        <button class="comp-mode-btn ${this._mode==='ai-quiz'?'active':''}" data-mode="ai-quiz">⬡ AI Exam</button>
      </div>

      <div class="competency-toolbar">
        <select id="comp-subject" class="config-select" style="max-width:220px;">${subjectOptions}</select>
        <button class="btn-primary" id="comp-start-btn">
          ${this._mode==='report'?'Generate Report':this._mode==='timed'?'▶ Start Timed Quiz':'▶ Start AI Exam'}
        </button>
      </div>

      <div id="comp-content"></div>
    `;

    container.querySelectorAll('.comp-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._mode = btn.dataset.mode;
        container.querySelectorAll('.comp-mode-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('comp-start-btn').textContent =
          this._mode==='report'?'Generate Report':this._mode==='timed'?'▶ Start Timed Quiz':'▶ Start AI Exam';
        document.getElementById('comp-content').innerHTML = '';
      });
    });

    document.getElementById('comp-subject').addEventListener('change', e => { this._subject = e.target.value; });

    document.getElementById('comp-start-btn').addEventListener('click', () => {
      this._subject = document.getElementById('comp-subject').value;
      const filtered = this._subject==='all' ? nodes : nodes.filter(n=>n.subject===this._subject);
      if (!filtered.length) { Toast.error('No nodes in selected subject.'); return; }
      if (this._mode==='report')   this._showReport(filtered, nodes);
      else if (this._mode==='timed')   this._startTimedQuiz(filtered);
      else if (this._mode==='ai-quiz') this._startAIExam(filtered);
    });

    // Show report by default if nodes exist
    if (nodes.length && !this._started) { this._showReport(nodes, nodes); }
  },

  // ─── 1. REPORT CARD ───────────────────────────────────

  _showReport(filteredNodes, allNodes) {
    const el = document.getElementById('comp-content');

    // Per-subject breakdown
    const subjects = {};
    filteredNodes.forEach(n => {
      const s = n.subject || 'Uncategorised';
      if (!subjects[s]) subjects[s] = { nodes:[], totalQ:0, masterySum:0, due:0, weakTopics:[] };
      subjects[s].nodes.push(n);
      subjects[s].totalQ   += n.questions.length;
      subjects[s].masterySum += n.masteryScore;
      subjects[s].due      += n.dueQuestions().length;
      if (n.masteryScore < 50) subjects[s].weakTopics.push(n.title);
    });

    const overallMastery = filteredNodes.length
      ? Math.round(filteredNodes.reduce((s,n)=>s+n.masteryScore,0)/filteredNodes.length)
      : 0;

    const grade = this._grade(overallMastery);

    const subjectCards = Object.entries(subjects).map(([subj, data]) => {
      const avg = Math.round(data.masterySum / data.nodes.length);
      const g   = this._grade(avg);
      return `
        <div class="comp-subject-card">
          <div class="comp-subject-header">
            <div>
              <div class="comp-subject-name">${this._esc(subj)}</div>
              <div class="comp-subject-meta">${data.nodes.length} nodes · ${data.totalQ} questions</div>
            </div>
            <div class="comp-grade ${g.cls}">${g.letter}</div>
          </div>
          <div class="comp-bar-row">
            <div class="mastery-bar-track" style="flex:1;height:8px;">
              <div class="mastery-bar-fill" style="width:${avg}%;height:8px;"></div>
            </div>
            <span style="font-family:var(--font-mono);font-size:12px;color:var(--accent);min-width:36px;text-align:right;">${avg}%</span>
          </div>
          ${data.weakTopics.length ? `
            <div class="comp-weak-topics">
              <span style="color:var(--red);font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:0.08em;">Needs attention:</span>
              ${data.weakTopics.map(t=>`<span class="comp-topic-pill weak">${this._esc(t)}</span>`).join('')}
            </div>` : `
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--green);margin-top:8px;">✓ All topics above 50% mastery</div>`}
          ${data.due > 0 ? `<div style="font-family:var(--font-mono);font-size:11px;color:var(--accent);margin-top:6px;">⚠ ${data.due} cards due for review</div>` : ''}
          <div class="comp-node-list">
            ${data.nodes.sort((a,b)=>a.masteryScore-b.masteryScore).map(n=>`
              <div class="comp-node-row">
                <span class="comp-node-name">${this._esc(n.title)}</span>
                <div class="mastery-bar-track" style="width:80px;height:4px;"><div class="mastery-bar-fill" style="width:${n.masteryScore}%;height:4px;background:${n.masteryScore<40?'var(--red)':n.masteryScore<70?'var(--accent)':'var(--green)'};"></div></div>
                <span style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);min-width:28px;">${n.masteryScore}%</span>
              </div>`).join('')}
          </div>
        </div>`;
    }).join('');

    // Recommendations
    const weakSubjects = Object.entries(subjects).filter(([,d])=>Math.round(d.masterySum/d.nodes.length)<50).map(([s])=>s);
    const recommendations = weakSubjects.length
      ? `Focus immediate attention on: <strong>${weakSubjects.join(', ')}</strong>. These subjects are below 50% mastery and should be prioritised in your study plan.`
      : overallMastery >= 80
        ? 'Excellent preparation! Keep up the spaced repetition reviews to maintain retention before your exam.'
        : 'Good progress. Continue with daily reviews and focus on application questions to push mastery higher.';

    el.innerHTML = `
      <div class="comp-overall-card">
        <div class="comp-overall-left">
          <div class="comp-overall-grade ${grade.cls}">${grade.letter}</div>
          <div>
            <div style="font-family:var(--font-ui);font-size:22px;font-weight:800;">${grade.label}</div>
            <div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);">Overall Mastery: ${overallMastery}%</div>
          </div>
        </div>
        <canvas id="comp-radar" width="200" height="200"></canvas>
      </div>
      <div class="comp-recommendation">${recommendations}</div>
      <div class="comp-subjects-grid">${subjectCards}</div>
    `;

    // Draw radar / bar chart
    setTimeout(() => this._drawRadar(subjects), 50);
  },

  _drawRadar(subjects) {
    const canvas = document.getElementById('comp-radar');
    if (!canvas) return;
    const ctx  = canvas.getContext('2d');
    const cx   = 100, cy = 100, r = 75;
    const entries = Object.entries(subjects);
    if (!entries.length) return;

    ctx.clearRect(0, 0, 200, 200);

    // Draw grid circles
    [25,50,75,100].forEach(pct => {
      ctx.beginPath();
      ctx.arc(cx, cy, r * pct/100, 0, Math.PI*2);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    if (entries.length < 3) {
      // Fall back to horizontal bars for fewer than 3 subjects
      entries.forEach(([s,d], i) => {
        const avg = Math.round(d.masterySum / d.nodes.length);
        const y   = 30 + i * 50;
        ctx.fillStyle = 'rgba(240,165,0,0.15)';
        ctx.fillRect(10, y, (180 * avg/100), 28);
        ctx.fillStyle = 'var(--accent)';
        ctx.font = '11px DM Mono, monospace';
        ctx.fillText(`${s.slice(0,12)}: ${avg}%`, 14, y+18);
      });
      return;
    }

    const step = (Math.PI * 2) / entries.length;

    // Draw spokes
    entries.forEach((_, i) => {
      const a = -Math.PI/2 + i*step;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a)*r, cy + Math.sin(a)*r);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.stroke();
    });

    // Draw data polygon
    ctx.beginPath();
    entries.forEach(([,d], i) => {
      const avg = Math.round(d.masterySum / d.nodes.length);
      const a   = -Math.PI/2 + i*step;
      const pr  = r * avg/100;
      i===0 ? ctx.moveTo(cx+Math.cos(a)*pr, cy+Math.sin(a)*pr)
            : ctx.lineTo(cx+Math.cos(a)*pr, cy+Math.sin(a)*pr);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(240,165,0,0.2)';
    ctx.fill();
    ctx.strokeStyle = 'var(--accent)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Labels
    ctx.fillStyle = document.documentElement.classList.contains('light-theme') ? '#333' : '#ccc';
    ctx.font = '10px DM Mono, monospace';
    ctx.textAlign = 'center';
    entries.forEach(([s,d], i) => {
      const avg = Math.round(d.masterySum / d.nodes.length);
      const a   = -Math.PI/2 + i*step;
      const lx  = cx + Math.cos(a)*(r+14);
      const ly  = cy + Math.sin(a)*(r+14);
      ctx.fillText(s.slice(0,8), lx, ly);
      ctx.fillText(`${avg}%`, lx, ly+12);
    });
  },

  // ─── 2. TIMED QUIZ ────────────────────────────────────

  _startTimedQuiz(nodes) {
    // Timed quiz answers one item at a time, so matching sets stay per-item
    // (still tappable) rather than grouped into one big table.
    this._session = this._buildSession(nodes, 10, false);
    if (!this._session.length) { Toast.error('No questions available.'); return; }
    this._idx     = 0;
    this._answers = [];
    this._started = true;

    const totalSeconds = this._session.length * 60; // 1 min per question
    this._timeLeft = totalSeconds;
    this._renderTimedQuiz();
  },

  /** True if a subject has analysed past papers (examiner signal). */
  _hasPastPaper(subject) {
    try {
      const raw = localStorage.getItem('kn_exam_style_' + String(subject || '').toLowerCase().replace(/\s+/g, '_'));
      return !!(raw && (JSON.parse(raw).papers || []).length);
    } catch (e) { return false; }
  },

  /**
   * Build a mock-exam question set that actually prepares the learner, instead
   * of a pure random draw. Each question is scored by how VALUABLE it is to be
   * tested on right now, then selected with subject BREADTH and some variety:
   *   • struggled-with questions (the weak-spot log) are weighted up — you most
   *     need to test what you keep getting wrong;
   *   • questions due/overdue for review are weighted up (retrieval when it
   *     matters most);
   *   • never-tested questions get a modest boost (don't leave gaps);
   *   • subjects with analysed past papers get a boost (the examiner's turf);
   *   • a random jitter keeps repeated exams from being identical.
   * A per-topic cap stops any one topic from dominating, so the paper stays
   * representative of the whole syllabus. Same {q, node} shape as before.
   */
  _buildSession(nodes, max, group) {
    if (group === undefined) group = true;
    const now = Date.now();
    // Matching sets: any selected member pulls in its whole two-column set as a
    // single paper slot (so the exam shows the real match-and-pair table).
    const qGroup = new Map();          // question id → group payload
    if (group && window.MatchGroup) {
      (nodes || []).forEach(n => { MatchGroup.indexByQuestion(n).forEach((g, qid) => qGroup.set(qid, { g, node: n })); });
    }
    const scored = [];
    (nodes || []).forEach(n => {
      const weak = new Map((n.weakQuestions || []).map(w => [w.id, w.count || 1]));
      const examBoost = this._hasPastPaper(n.subject) ? 0.4 : 0;
      (n.questions || []).forEach(q => {
        const s = n.srsState && n.srsState[q.id];
        let score = 1;
        if (weak.has(q.id))                       score += 0.5 * Math.min(3, weak.get(q.id)); // struggled
        if (s && s.nextReview && s.nextReview <= now) score += 0.4;                            // due/overdue
        if (!s || (s.repetitions || 0) === 0)     score += 0.25;                               // never tested
        score += examBoost;                                                                    // examiner topics
        score *= 0.75 + Math.random() * 0.5;                                                    // variety
        scored.push({ q, node: n, score });
      });
    });
    if (!scored.length) return [];
    scored.sort((a, b) => b.score - a.score);

    // Breadth: cap how many any single topic may contribute (when there's choice).
    const nodeCount = new Set(scored.map(x => x.node.id)).size;
    const perNodeCap = Math.max(1, Math.ceil(max / Math.max(1, Math.min(nodeCount, max))));
    const picked = [], perNode = {}, chosen = new Set(), groupsAdded = new Set();
    // Emit a slot for a scored item — a match-set member emits its whole group
    // once (counting as one paper slot); everything else emits itself.
    const emit = (it) => {
      const gi = qGroup.get(it.q.id);
      if (gi) {
        if (groupsAdded.has(gi.g.key)) return false;
        groupsAdded.add(gi.g.key);
        gi.g.prompts.forEach(p => chosen.add(p.q.id));
        picked.push({ q: gi.g.prompts[0].q, node: gi.node, match: gi.g });
        return true;
      }
      chosen.add(it.q.id);
      picked.push({ q: it.q, node: it.node });
      return true;
    };
    for (const it of scored) {
      if (picked.length >= max) break;
      if (chosen.has(it.q.id)) continue;
      if ((perNode[it.node.id] || 0) >= perNodeCap) continue;
      if (emit(it)) perNode[it.node.id] = (perNode[it.node.id] || 0) + 1;
    }
    // Fill any shortfall (e.g. very few topics) ignoring the cap, best score first.
    if (picked.length < max) {
      for (const it of scored) {
        if (picked.length >= max) break;
        if (chosen.has(it.q.id)) continue;
        emit(it);
      }
    }
    return picked;
  },

  _renderTimedQuiz() {
    const el  = document.getElementById('comp-content');
    const total = this._session.length;
    el.innerHTML = `
      <div class="quiz-shell">
        <div class="quiz-header">
          <span class="quiz-counter" id="quiz-counter">Question ${this._idx+1} of ${total}</span>
          <div class="quiz-timer" id="quiz-timer">⏱ ${this._formatTime(this._timeLeft)}</div>
        </div>
        <div class="quiz-progress-track"><div class="quiz-progress-fill" id="quiz-prog" style="width:${(this._idx/total)*100}%"></div></div>
        <div id="quiz-card" class="quiz-card"></div>
      </div>`;
    this._renderTimedQuestion();
    this._startTimer();
  },

  _renderTimedQuestion() {
    const el  = document.getElementById('quiz-card');
    const item = this._session[this._idx];
    if (!item) { this._clearTimer(); this._showTimedResults(); return; }

    el.innerHTML = `
      <div class="quiz-node-tag">${this._esc(item.node.title)}</div>
      ${this._answerBlock(item.q, '', 'timed-answer', 'Type your answer…')}
      <div class="quiz-actions">
        <button class="btn-primary" id="timed-submit">Submit →</button>
        <button class="btn-secondary" id="timed-skip">Skip</button>
      </div>`;

    this._wireMatchTaps(item.q, 'timed-answer');
    document.getElementById('timed-submit').addEventListener('click', () => {
      const ans = document.getElementById('timed-answer').value.trim();
      this._answers.push({ item, answer: ans, skipped: false });
      this._idx++;
      this._renderTimedQuestion();
    });
    document.getElementById('timed-skip').addEventListener('click', () => {
      this._answers.push({ item, answer: '', skipped: true });
      this._idx++;
      this._renderTimedQuestion();
    });
  },

  _startTimer() {
    this._clearTimer();
    this._timer = setInterval(() => {
      this._timeLeft--;
      const el = document.getElementById('quiz-timer');
      if (el) {
        el.textContent = `⏱ ${this._formatTime(this._timeLeft)}`;
        el.classList.toggle('low', this._timeLeft <= 30); // red + pulse in final 30s
      }
      if (this._timeLeft <= 0) { this._clearTimer(); this._showTimedResults(); }
    }, 1000);
  },

  _clearTimer() { if (this._timer) { clearInterval(this._timer); this._timer = null; } },
  _formatTime(s) { return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; },

  async _showTimedResults() {
    this._clearTimer();
    const graded = await this._gradeAll(this._answers, 'Marking your paper…');
    this._renderGradedResults(graded, 'Timed Quiz Results');
  },

  /** Mark a whole set of answers in one pass, exam-style. Free instant checks
   *  (MCQ letters, exact matches) run first so those cost no AI credits; the
   *  rest of the paper is marked in ONE batched AI call (chunked for long
   *  papers), falling back to per-question grading only if a batch fails. */
  async _gradeAll(answers, headline) {
    const el = document.getElementById('comp-content');
    el.innerHTML = `<div style="text-align:center;padding:40px 20px;"><div class="hex-ring" style="margin:0 auto 20px;"></div><p style="font-family:var(--font-mono);color:var(--accent);">${this._esc(headline || 'Marking…')}</p><p id="comp-marking" style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-top:8px;"></p></div>`;
    const setProgress = (t) => { const p = document.getElementById('comp-marking'); if (p) p.textContent = t; };

    // Pass 1 — free: skipped answers and confident instant matches.
    const graded = new Array(answers.length);
    const pending = []; // indexes that genuinely need AI judgement
    answers.forEach((a, i) => {
      if (a.skipped || !a.answer) { graded[i] = { ...a, result: { score:0, feedback:'Skipped.', correct:false, keyPointsMissed:[] } }; return; }
      const quick = (typeof LocalGrader !== 'undefined')
        ? LocalGrader.match(a.answer, LocalGrader.acceptedFor(a.item.q))
        : { verdict: 'unknown' };
      if (quick.verdict === 'correct') {
        graded[i] = { ...a, result: { score:95, correct:true, feedback:'Instant check: matches the model answer. No AI credits used. ⚡', keyPointsMissed:[] } };
        return;
      }
      pending.push(i);
    });

    // Pass 2 — one batched marking call per chunk of 8 (not one per question).
    const CHUNK = 8;
    for (let c = 0; c < pending.length; c += CHUNK) {
      const chunk = pending.slice(c, c + CHUNK);
      setProgress('Marking answers ' + (c + 1) + '–' + Math.min(c + CHUNK, pending.length) + ' of ' + pending.length + '…');
      let done = false;
      if (AIService.hasApiKey()) {
        try {
          const results = await AIService.gradeBatch(chunk.map(i => ({
            question: answers[i].item.q.question, modelAnswer: answers[i].item.q.answer,
            studentAnswer: answers[i].answer, subject: answers[i].item.node.subject,
          })));
          chunk.forEach((ansIdx, k) => {
            const r = results[k] || {};
            graded[ansIdx] = { ...answers[ansIdx], result: {
              score: Math.max(0, Math.min(100, Math.round(r.score || 0))),
              correct: !!r.correct, feedback: r.feedback || '',
              keyPointsMissed: Array.isArray(r.keyPointsMissed) ? r.keyPointsMissed : [],
            } };
          });
          done = true;
        } catch (e) { /* batch failed — fall through to per-question below */ }
      }
      if (!done) {
        for (const i of chunk) {
          const a = answers[i];
          try {
            const r = AIService.hasApiKey()
              ? await AIService.checkAnswer(a.item.q.question, a.item.q.answer, a.answer, a.item.node.subject)
              : this._mockGrade(a.answer, a.item.q.answer);
            graded[i] = { ...a, result: r };
          } catch { graded[i] = { ...a, result: { score:50, feedback:'Could not grade — check answer manually.', correct: null, keyPointsMissed:[] } }; }
        }
      }
    }
    return graded;
  },

  // ─── 3. AI EXAM ───────────────────────────────────────

  async _startAIExam(nodes) {
    this._session = this._buildSession(nodes, 8);
    if (!this._session.length) { Toast.error('No questions available.'); return; }
    this._idx     = 0;
    this._answers = [];
    this._started = true;
    this._renderAIExamQuestion();
  },

  /** Is a paper slot answered? Match slots count if any pair is assigned. */
  _slotFilled(i) {
    const a = this._answers[i];
    if (!a) return false;
    if (a.match) return (a.letters || []).some(Boolean);
    return !!a.answer;
  },

  /** Render a whole matching set as an interactive two-column table: the
   *  Column-A prompts (each a tappable row with an assign badge) above the
   *  Column-B answer bank. Tap a prompt, then tap its match. Reads like the
   *  paper worksheet; graded pair-by-pair for free. */
  _matchCard(group, letters) {
    const rows = group.prompts.map((p, k) => {
      const L = letters[k] || '';
      return `<button type="button" class="mp-row" data-prompt="${k}"
        style="display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:12px 14px;margin:6px 0;border-radius:12px;cursor:pointer;
        border:1.5px solid var(--border);background:var(--bg-raised);color:var(--text);font-size:15px;line-height:1.4;transition:border-color .12s,background .12s;">
        <span class="mp-badge" style="flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9px;font-family:var(--font-mono);font-weight:700;font-size:14px;
          border:1.5px solid ${L ? 'var(--accent)' : 'var(--border)'};background:${L ? 'var(--accent)' : 'transparent'};color:${L ? '#fff' : 'var(--text-muted)'};">${L || '?'}</span>
        <span style="flex:1;">${this._esc(p.prompt)}</span></button>`;
    }).join('');
    const bank = group.options.map(o =>
      `<button type="button" class="mp-opt" data-letter="${o.letter}"
        style="display:flex;align-items:flex-start;gap:10px;width:100%;text-align:left;padding:11px 13px;margin:5px 0;border-radius:11px;cursor:pointer;
        border:1.5px solid var(--border);background:var(--bg-elevated,var(--bg-raised));color:var(--text);font-size:14px;line-height:1.4;transition:border-color .12s,background .12s;">
        <span style="flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;font-family:var(--font-mono);font-weight:700;font-size:12px;border:1.5px solid var(--border);color:var(--text-muted);">${o.letter}</span>
        <span style="flex:1;padding-top:2px;">${this._esc(o.text)}</span></button>`).join('');
    const instr = group.instruction || 'Match each item on the left to the correct option below.';
    return `
      <div class="quiz-question" style="margin-bottom:4px;">${this._esc(instr)}</div>
      <p id="mp-hint" style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin:4px 0 10px;">Tap an item, then tap its match. Tap again to change it.</p>
      <div style="font-family:var(--font-mono);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin:2px 0;">Column A</div>
      <div id="mp-rows">${rows}</div>
      <div style="font-family:var(--font-mono);font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin:16px 0 2px;">Column B</div>
      <div id="mp-bank">${bank}</div>`;
  },

  /** Wire the two-column matcher: choose an active prompt, then assign a letter.
   *  State is saved live into this._answers[idx] so navigation preserves it. */
  _wireMatch(idx, item) {
    const group = item.match;
    const cur = this._answers[idx] && this._answers[idx].letters ? this._answers[idx].letters.slice() : [];
    const letters = group.prompts.map((_, k) => cur[k] || '');
    this._answers[idx] = { item, match: true, letters, skipped: !letters.some(Boolean) };
    const firstEmpty = () => { const i = letters.findIndex(l => !l); return i < 0 ? 0 : i; };
    let active = firstEmpty();

    const rows = () => Array.from(document.querySelectorAll('#mp-rows .mp-row'));
    const paintRows = () => rows().forEach((el, k) => {
      const on = k === active, L = letters[k] || '';
      el.style.borderColor = on ? 'var(--accent)' : 'var(--border)';
      el.style.background  = on ? 'var(--accent-soft)' : 'var(--bg-raised)';
      const badge = el.querySelector('.mp-badge');
      if (badge) {
        badge.textContent = L || '?';
        badge.style.borderColor = L ? 'var(--accent)' : (on ? 'var(--accent)' : 'var(--border)');
        badge.style.background  = L ? 'var(--accent)' : 'transparent';
        badge.style.color       = L ? '#fff' : 'var(--text-muted)';
      }
    });
    const save = () => { this._answers[idx].letters = letters.slice(); this._answers[idx].skipped = !letters.some(Boolean); };

    document.getElementById('mp-rows')?.addEventListener('click', (e) => {
      const r = e.target.closest('[data-prompt]'); if (!r) return;
      active = parseInt(r.dataset.prompt, 10); paintRows();
    });
    document.getElementById('mp-bank')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-letter]'); if (!b) return;
      if (active == null || active < 0) active = firstEmpty();
      letters[active] = b.dataset.letter.toUpperCase();
      save();
      const nextEmpty = letters.findIndex(l => !l);
      if (nextEmpty >= 0) active = nextEmpty;       // auto-advance to the next blank
      paintRows();
    });
    paintRows();
  },

  /** Build the answer area for one question. Lettered-option / matching
   *  questions become tappable choices (Column B); everything else keeps the
   *  free-text box. A hidden #ai-answer always holds the value so the existing
   *  save + grading path is unchanged. */
  _answerBlock(q, savedAnswer, id, placeholder) {
    id = id || 'ai-answer'; placeholder = placeholder || 'Write a thorough answer…';
    const parsed = (window.MatchOptions && MatchOptions.parse) ? MatchOptions.parse(q.question) : null;
    if (!parsed) {
      return `<div class="quiz-question">${window.KNText ? KNText.html(q.question) : this._esc(q.question)}</div>`
        + `<textarea id="${id}" class="config-input" rows="5" placeholder="${placeholder}">${this._esc(savedAnswer || '')}</textarea>`;
    }
    const chosen = MatchOptions.letterOf(parsed, savedAnswer);
    const stemHtml = parsed.stem
      ? `<div class="quiz-question">${window.KNText ? KNText.html(parsed.stem) : this._esc(parsed.stem)}</div>`
      : '';
    const opts = parsed.options.map(o => {
      const on = o.letter === chosen;
      return `<button type="button" class="match-opt${on ? ' is-picked' : ''}" data-letter="${o.letter}"
        style="display:flex;align-items:flex-start;gap:10px;width:100%;text-align:left;padding:12px 14px;margin:6px 0;border-radius:12px;cursor:pointer;
        border:1.5px solid ${on ? 'var(--accent)' : 'var(--border)'};background:${on ? 'var(--accent-soft)' : 'var(--bg-raised)'};
        color:var(--text);font-size:15px;line-height:1.4;transition:border-color .12s,background .12s;">
        <span style="flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;font-family:var(--font-mono);font-weight:700;font-size:13px;
          border:1.5px solid ${on ? 'var(--accent)' : 'var(--border)'};background:${on ? 'var(--accent)' : 'transparent'};color:${on ? '#fff' : 'var(--text-muted)'};">${o.letter}</span>
        <span style="flex:1;padding-top:2px;">${this._esc(o.text)}</span></button>`;
    }).join('');
    return stemHtml
      + `<p style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin:4px 0 8px;">Tap the matching option:</p>`
      + `<div id="match-opts">${opts}</div>`
      + `<textarea id="${id}" style="display:none;">${this._esc(savedAnswer || '')}</textarea>`;
  },

  /** Wire the tappable matching options for a rendered question. `answerId` is
   *  the hidden field the choice is written into (#ai-answer or #timed-answer).
   *  No-op when the current question isn't a lettered-option set. */
  _wireMatchTaps(q, answerId) {
    const parsed = (window.MatchOptions && MatchOptions.parse) ? MatchOptions.parse(q.question) : null;
    const host = document.getElementById('match-opts');
    if (!parsed || !host) return;
    host.addEventListener('click', (e) => {
      const b = e.target.closest('[data-letter]');
      if (!b) return;
      const hidden = document.getElementById(answerId);
      if (hidden) hidden.value = MatchOptions.answerFor(parsed, b.dataset.letter);
      host.querySelectorAll('.match-opt').forEach(el => {
        const on = el === b;
        el.classList.toggle('is-picked', on);
        el.style.borderColor = on ? 'var(--accent)' : 'var(--border)';
        el.style.background  = on ? 'var(--accent-soft)' : 'var(--bg-raised)';
        const dot = el.firstElementChild;
        if (dot) {
          dot.style.borderColor = on ? 'var(--accent)' : 'var(--border)';
          dot.style.background  = on ? 'var(--accent)' : 'transparent';
          dot.style.color       = on ? '#fff' : 'var(--text-muted)';
        }
      });
    });
  },

  /** Full-paper exam: answer EVERY question first (with back/forward and a
   *  jump strip, answers preserved), then submit the whole exam for marking
   *  in one go — like a real exam. No feedback or model answers mid-paper. */
  _renderAIExamQuestion() {
    const el    = document.getElementById('comp-content');
    const total = this._session.length;
    if (this._idx < 0) this._idx = 0;
    if (this._idx >= total) this._idx = total - 1;
    const item  = this._session[this._idx];
    if (!item) return;
    const saved  = this._answers[this._idx];
    const answered = this._session.reduce((n, _, i) => n + (this._slotFilled(i) ? 1 : 0), 0);
    const isLast = this._idx === total - 1;

    const chips = this._session.map((_, i) => {
      const has = this._slotFilled(i);
      const cur = i === this._idx;
      return `<button data-q="${i}" style="min-width:32px;padding:5px 0;border-radius:8px;font-family:var(--font-mono);font-size:11px;cursor:pointer;border:1px solid ${cur?'var(--accent)':'var(--border)'};background:${has?'var(--accent-soft)':'var(--bg-raised)'};color:${cur?'var(--accent)':has?'var(--accent)':'var(--text-muted)'};font-weight:${cur?'700':'400'};">${i+1}</button>`;
    }).join('');

    el.innerHTML = `
      <div class="quiz-shell">
        <div class="quiz-header">
          <span class="quiz-counter">Question ${this._idx+1} of ${total}</span>
          <span class="quiz-node-tag">${this._esc(item.node.title)}</span>
        </div>
        <div class="quiz-progress-track"><div class="quiz-progress-fill" style="width:${(answered/total)*100}%"></div></div>
        <div id="ai-jump" style="display:flex;gap:6px;flex-wrap:wrap;margin:12px 0;">${chips}</div>
        <p style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-bottom:12px;">Answer the whole paper first — it is marked in one go when you submit at the end, like a real exam. Leave a question blank to skip it.</p>
        <div class="quiz-card">
          ${item.match ? this._matchCard(item.match, (saved && saved.letters) || []) : this._answerBlock(item.q, saved && saved.answer ? saved.answer : '')}
          <div class="quiz-actions">
            ${this._idx > 0 ? '<button class="btn-secondary" id="ai-prev">← Back</button>' : ''}
            <button class="btn-primary" id="ai-next">${isLast ? '📤 Submit exam for marking' : 'Next →'}</button>
          </div>
        </div>
      </div>`;

    const saveCurrent = () => {
      if (item.match) return;   // match slots are saved live on each tap
      const ans = document.getElementById('ai-answer')?.value.trim() || '';
      this._answers[this._idx] = { item, answer: ans, skipped: !ans };
    };
    if (item.match) this._wireMatch(this._idx, item);
    else this._wireMatchTaps(item.q, 'ai-answer');
    document.getElementById('ai-prev')?.addEventListener('click', () => { saveCurrent(); this._idx--; this._renderAIExamQuestion(); });
    document.getElementById('ai-next')?.addEventListener('click', () => {
      saveCurrent();
      if (isLast) { this._finishAIExam(); }
      else { this._idx++; this._renderAIExamQuestion(); }
    });
    document.getElementById('ai-jump')?.addEventListener('click', (e) => {
      const c = e.target.closest('[data-q]');
      if (!c) return;
      saveCurrent();
      this._idx = parseInt(c.dataset.q, 10);
      this._renderAIExamQuestion();
    });
  },

  async _finishAIExam() {
    // Every slot gets an entry so the whole paper is accounted for.
    this._session.forEach((item, i) => {
      if (this._answers[i]) return;
      this._answers[i] = item.match
        ? { item, match: true, letters: item.match.prompts.map(() => ''), skipped: true }
        : { item, answer: '', skipped: true };
    });
    // Count blanks: unassigned match pairs + skipped open questions.
    let blank = 0;
    this._session.forEach((item, i) => {
      const a = this._answers[i];
      if (item.match) blank += (a.letters || []).filter(l => !l).length;
      else if (!a.answer) blank += 1;
    });
    if (blank > 0 && !confirm(blank + ' answer' + (blank === 1 ? ' is' : 's are') + ' blank. Submit the exam anyway?')) {
      this._renderAIExamQuestion();
      return;
    }

    // Grade match pairs on-device and DEFINITIVELY (a matching choice is either
    // the right letter or it isn't — no AI credits, ever); send only genuinely
    // open questions to the batched grader.
    const finalGraded = [];
    const openList = [], openPos = [];
    this._session.forEach((item, i) => {
      const a = this._answers[i];
      if (item.match) {
        const g = item.match;
        g.prompts.forEach((p, k) => {
          const L = (a.letters && a.letters[k]) || '';
          const correctL = window.MatchGroup ? MatchGroup.correctLetter(g, p.answer) : null;
          const correct  = !!(L && correctL && L === correctL);
          finalGraded.push({
            item: { q: { question: p.prompt, answer: p.answer }, node: item.node },
            answer: L ? MatchGroup.answerFor(g, L) : '',
            skipped: !L,
            result: {
              score: correct ? 100 : 0,
              correct: L ? correct : false,
              feedback: !L ? 'Skipped.' : correct ? 'Correct match. ⚡ No AI credits used.' : 'Not the right match.',
              keyPointsMissed: [],
            },
          });
        });
      } else {
        openPos.push(finalGraded.length);
        finalGraded.push(null);
        openList.push(a);
      }
    });

    if (openList.length) {
      const gradedOpen = await this._gradeAll(openList, 'Marking your exam…');
      gradedOpen.forEach((g, j) => { finalGraded[openPos[j]] = g; });
    }
    this._renderGradedResults(finalGraded, 'AI Exam Results');
  },

  // ─── Shared results renderer ──────────────────────────

  _renderGradedResults(graded, title) {
    const el      = document.getElementById('comp-content');
    const total   = graded.length;
    const avg     = total ? Math.round(graded.reduce((s,a)=>s+(a.result?.score||0),0)/total) : 0;
    const passed  = graded.filter(a=>(a.result?.score||0)>=70).length;
    const grade   = this._grade(avg);

    const rows = graded.map((a, i) => {
      const score = a.result?.score || 0;
      const color = score>=70?'var(--green)':score>=40?'var(--accent)':'var(--red)';
      return `
        <div style="background:var(--bg-raised);border:1px solid var(--border);border-left:3px solid ${color};border-radius:var(--radius-md);padding:14px 18px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
            <div style="font-family:var(--font-body);font-size:14px;color:var(--text-primary);flex:1;">${i+1}. ${window.KNText ? KNText.html(a.item.q.question) : this._esc(a.item.q.question)}</div>
            <span style="font-family:var(--font-mono);font-size:13px;color:${color};font-weight:600;flex-shrink:0;">${score}/100</span>
          </div>
          ${a.skipped?'<span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">Skipped</span>':''}
          ${!a.skipped&&a.answer?`<div style="font-family:var(--font-body);font-size:13px;color:var(--text-secondary);font-style:italic;margin-bottom:6px;">"${this._esc(a.answer.slice(0,120))}${a.answer.length>120?'…':''}"</div>`:''}
          ${a.result?.feedback?`<div style="font-family:var(--font-body);font-size:13px;color:var(--text-primary);">${this._esc(a.result.feedback)}</div>`:''}
          ${score<70&&a.item.q.answer?`<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border-soft);font-family:var(--font-body);font-size:13px;color:var(--text-secondary);"><span style="font-family:var(--font-mono);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--green);">Model answer</span><br>${window.KNText?KNText.html(a.item.q.answer):this._esc(a.item.q.answer)}</div>`:''}
        </div>`;
    }).join('');

    el.innerHTML = `
      <div class="comp-overall-card" style="margin-bottom:24px;">
        <div class="comp-overall-left">
          <div class="comp-grade comp-grade-lg ${grade.cls}">${grade.letter}</div>
          <div>
            <div style="font-family:var(--font-ui);font-size:20px;font-weight:800;">${title}</div>
            <div style="font-family:var(--font-mono);font-size:13px;color:var(--accent);">${avg}/100 average · ${passed}/${total} passed (≥70%)</div>
          </div>
        </div>
        <button class="btn-secondary" id="comp-retry-btn">↺ Try Again</button>
      </div>
      <div class="notes-section-title">Question Breakdown</div>
      ${rows}
    `;
    document.getElementById('comp-retry-btn').addEventListener('click', () => {
      this._started = false; this.refresh();
    });
  },

  // ─── Helpers ──────────────────────────────────────────

  _grade(pct) {
    if (pct >= 90) return { letter:'A+', label:'Outstanding',  cls:'grade-a-plus' };
    if (pct >= 80) return { letter:'A',  label:'Excellent',    cls:'grade-a'      };
    if (pct >= 70) return { letter:'B',  label:'Good',         cls:'grade-b'      };
    if (pct >= 60) return { letter:'C',  label:'Satisfactory', cls:'grade-c'      };
    if (pct >= 50) return { letter:'D',  label:'Needs Work',   cls:'grade-d'      };
    return                { letter:'F',  label:'Critical Gap', cls:'grade-f'      };
  },

  _mockGrade(student, correct) {
    const words  = correct.toLowerCase().split(/\s+/);
    const hits   = words.filter(w => w.length>3 && student.toLowerCase().includes(w)).length;
    const score  = Math.min(100, Math.round((hits / Math.max(words.length, 1)) * 130));
    return {
      correct:       score >= 60,
      score,
      feedback:      score>=70 ? 'Good answer — key concepts covered.' : score>=40 ? 'Partially correct. See model answer for gaps.' : 'Needs improvement. Review this topic carefully.',
      keyPointsMissed: score < 70 ? ['See model answer above'] : [],
    };
  },

  _esc: s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
};
