/**
 * Dashboard.js v2 — Combined Progress + Study Plan view
 * Shows: today's plan, stats, heatmap, subject mastery, quick actions
 */
const Dashboard = {
  init() {},

  refresh() {
    const container = document.getElementById('dashboard-body');
    if (!container) return;

    const nodes  = nodeStore.getAll().filter(n => n.processingStatus === 'ready');
    const streak = StreakTracker.getStats();
    const plan   = PlanStore.getActive();

    // Single-pass computation — avoids calling dueQuestions() and
    // iterating sessionLog separately for stats, subjects, and weekly activity.
    const now     = Date.now();
    const weekAgo = now - 7 * 86400000;
    const subjects = {};
    const activeDays = new Set();
    let totalMastery = 0, totalQuestions = 0, totalDue = 0;
    let weekReviews = 0, weekSessions = 0;

    // True single pass — compute subjects, mastery, due, and weekly activity together.
    // dueQuestions() iterates srsState internally; we inline it here to avoid calling
    // it twice (once in the loop, once in getStats which was already called above).
    for (const n of nodes) {  // `now` already declared above
      const subj = n.subject || 'Uncategorised';
      // Inline due check: same logic as dueQuestions() but without creating an array
      let due = 0;
      for (const q of n.questions) {
        const srs = n.srsState[q.id];
        if (srs && srs.repetitions > 0 && srs.nextReview <= now) due++;
      }
      if (!subjects[subj]) subjects[subj] = { nodes:0, mastery:0, questions:0, due:0 };
      subjects[subj].nodes++;
      subjects[subj].mastery   += n.masteryScore;
      subjects[subj].questions += n.questions.length;
      subjects[subj].due       += due;
      totalMastery   += n.masteryScore;
      totalQuestions += n.questions.length;
      totalDue       += due;
      for (const ev of (n.sessionLog || [])) {
        if (ev.ts && ev.ts >= weekAgo) {
          activeDays.add(ev.date || new Date(ev.ts).toLocaleDateString());
          if (ev.type === 'review' || ev.kind === 'review') weekReviews++;
          else weekSessions++;
        }
      }
    }

    const stats = {
      total:   nodes.length,
      mastery: nodes.length ? Math.round(totalMastery / nodes.length) : 0,
      due:     totalDue,
    };

    const subjectRows = Object.entries(subjects).map(([s, v]) => {
      const avg = v.nodes ? Math.round(v.mastery / v.nodes) : 0;
      return `
        <div class="dash-subject-row">
          <div class="dash-subject-name">${this._esc(s)}</div>
          <div class="dash-subject-stats">
            <span class="dash-pill">${v.nodes} nodes</span>
            ${v.due > 0 ? `<span class="dash-pill due">${v.due} due</span>` : ''}
          </div>
          <div class="dash-subject-bar-wrap">
            <div class="mastery-bar-track" style="height:5px;flex:1;">
              <div class="mastery-bar-fill" style="width:${avg}%;height:5px;"></div>
            </div>
            <span style="font-family:var(--font-mono);font-size:11px;color:var(--accent);min-width:32px;text-align:right;">${avg}%</span>
            <button class="dash-test-btn" onclick="CompetencyView.open('${this._esc(s)}')">🏆</button>
            ${(typeof PastPaperDrill !== 'undefined' && PastPaperDrill.count(s)) ? `<button class="dash-test-btn" title="Practice real past-paper questions" onclick="PastPaperDrill.open('${this._esc(s)}')">📝</button>` : ''}
          </div>
        </div>`;
    }).join('') || '<p style="color:var(--text-muted);font-family:var(--font-mono);font-size:13px;padding:12px 0;">No subjects yet.</p>';

    // Today's plan section
    const todaySection = plan ? this._renderTodayPlan(plan) : `
      <div class="dash-no-plan">
        <p>No active study plan.</p>
        <button class="btn-primary" style="margin-top:12px;font-size:13px;" data-action="new-plan">+ Create Study Plan</button>
      </div>`;

    // ── Exam readiness — evidence-based, always shown once you have topics ──
    // Uses the ExamReadiness engine (free, on-device): multi-signal score +
    // prioritised next actions. Works with or without a study plan.
    let readinessBanner = '';
    if (typeof ExamReadiness !== 'undefined' && nodes.length) {
      const r = ExamReadiness.assess(nodes, plan);
      const toneColor = r.band.tone === 'good' ? 'var(--green,#4ade80)'
                      : r.band.tone === 'low'  ? 'var(--red,#f87171)'
                      : 'var(--accent)';
      const countdown = r.daysToExam == null ? ''
        : (r.daysToExam === 0 ? 'TODAY' : r.daysToExam + ' day' + (r.daysToExam===1?'':'s') + ' to go');
      const chip = (label, val) => val == null ? '' :
        `<div style="flex:1;min-width:64px;text-align:center;">
           <div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:${val>=70?'var(--green,#4ade80)':val>=40?'var(--accent)':'var(--red,#f87171)'};">${val}%</div>
           <div style="font-family:var(--font-mono);font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);">${label}</div>
         </div>`;
      const actions = r.actions.map((a, i) =>
        `<button class="dash-readiness-action" ${a.nodeId ? `data-open-node="${a.nodeId}"` : `data-readiness="${a.kind}"`}
           style="display:flex;gap:10px;align-items:flex-start;width:100%;text-align:left;background:var(--bg-base);border:1px solid var(--border-soft);border-radius:10px;padding:10px 12px;margin-top:8px;cursor:pointer;color:var(--text-primary);font-family:var(--font-body);font-size:13px;line-height:1.5;">
           <span style="color:${toneColor};font-weight:800;flex-shrink:0;">${i+1}.</span>
           <span style="flex:1;">${this._esc(a.text)}</span>
           ${a.lift > 0 ? `<span style="flex-shrink:0;font-family:var(--font-mono);font-size:10px;color:var(--text-muted);">+${a.lift}%</span>` : ''}
         </button>`).join('');

      readinessBanner = `
        <div class="dash-section" style="border:1px solid ${toneColor};border-radius:var(--radius-lg);padding:16px 18px;background:var(--bg-raised);">
          <div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
            <span style="font-family:var(--font-ui);font-size:15px;font-weight:800;color:var(--text-primary);">🎯 Exam Readiness · <span style="color:${toneColor};">${r.band.label}</span></span>
            ${countdown ? `<span style="font-family:var(--font-mono);font-size:13px;color:${toneColor};font-weight:700;">${countdown}</span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div class="mastery-bar-track" style="height:8px;flex:1;">
              <div class="mastery-bar-fill" style="width:${r.score}%;height:8px;background:${toneColor};"></div>
            </div>
            <span style="font-family:var(--font-mono);font-size:16px;color:${toneColor};font-weight:800;min-width:44px;text-align:right;">${r.score}%</span>
          </div>
          <div style="display:flex;gap:6px;margin-bottom:6px;padding:8px 4px;background:var(--bg-base);border-radius:10px;">
            ${chip('Coverage', r.signals.coverage)}${chip('Mastery', r.signals.mastery)}${chip('Retention', r.signals.retention)}${chip('Exam fit', r.signals.alignment)}
          </div>
          <div style="font-family:var(--font-mono);font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:10px 0 2px;">Do these next — highest impact first</div>
          ${actions}
        </div>`;
    }

    const weekSection = `
      <div class="dash-section">
        <div class="dash-section-title" style="margin-bottom:14px;">📈 This Week</div>
        <div class="dash-stats-row">
          <div class="dash-stat-card">
            <div class="dash-stat-val">${activeDays.size}</div>
            <div class="dash-stat-label">Active Days</div>
          </div>
          <div class="dash-stat-card">
            <div class="dash-stat-val">${weekReviews + weekSessions}</div>
            <div class="dash-stat-label">Study Events</div>
          </div>
          <div class="dash-stat-card">
            <div class="dash-stat-val">${streak.longest}</div>
            <div class="dash-stat-label">Best Streak</div>
          </div>
        </div>
        <div style="margin-top:14px;">${StreakTracker.buildHeatmap ? StreakTracker.buildHeatmap() : ''}</div>
      </div>`;

    container.innerHTML = `
      ${readinessBanner}
      <!-- ASK YOUR COACH -->
      <button class="coach-cta" data-action="open-coach">
        <span class="coach-cta-orb">⬡</span>
        <span class="coach-cta-text"><strong>Ask your study coach</strong><span>Where should I start? What's weak? How do I use my time?</span></span>
        <span class="coach-cta-arrow">→</span>
      </button>
      <!-- TODAY'S PLAN -->
      <div class="dash-section">
        <div class="dash-section-title" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <span>📅 Today's Study Plan</span>
          ${plan ? `<div style="display:flex;gap:8px;">
            <button class="btn-secondary" style="font-size:11px;padding:6px 12px;" data-action="studyplan">Full Plan →</button>
            <button class="btn-secondary" style="font-size:11px;padding:6px 12px;" data-action="new-plan">New Plan</button>
          </div>` : ''}
        </div>
        ${todaySection}
      </div>

      <!-- STATS ROW -->
      <div class="dash-stats-row">
        <div class="dash-stat-card accent">
          <div class="dash-stat-icon"><span class="streak-fire">📅</span></div>
          <div class="dash-stat-val"><span class="streak-count">${streak.streak}</span></div>
          <div class="dash-stat-label">Day Streak</div>
        </div>
        <div class="dash-stat-card">
          <div class="dash-stat-val">${stats.total}</div>
          <div class="dash-stat-label">Total Nodes</div>
        </div>
        <div class="dash-stat-card">
          <div class="dash-stat-val">${stats.mastery}%</div>
          <div class="dash-stat-label">Avg Mastery</div>
        </div>
        <div class="dash-stat-card ${stats.due > 0 ? 'warn' : ''}">
          <div class="dash-stat-val">${stats.due}</div>
          <div class="dash-stat-label">Cards Due</div>
        </div>
        <div class="dash-stat-card">
          <div class="dash-stat-val">${nodes.reduce((s,n)=>s+n.questions.length,0)}</div>
          <div class="dash-stat-label">Questions</div>
        </div>
        <div class="dash-stat-card">
          <div class="dash-stat-val">${streak.longest}</div>
          <div class="dash-stat-label">Best Streak</div>
        </div>
      </div>

      <!-- HEATMAP -->
      <div class="dash-section">
        <div class="dash-section-title">Study Activity — Last 12 Weeks</div>
        ${StreakTracker.buildHeatmap()}
      </div>

      <!-- THIS WEEK -->
      ${nodes.length ? weekSection : ''}

      <!-- SUBJECTS -->
      ${nodes.length ? `
      <div class="dash-section">
        <div class="dash-section-title">Mastery by Subject</div>
        ${subjectRows}
      </div>

      <!-- DONUT -->
      <div class="dash-section">
        <div class="dash-section-title">Mastery Distribution</div>
        <canvas id="mastery-donut" width="200" height="200" style="display:block;margin:0 auto;max-width:200px;"></canvas>
        <div class="dash-legend" id="donut-legend"></div>
      </div>` : ''}

      <!-- QUICK ACTIONS -->
      <div class="dash-section">
        <div class="dash-section-title">Quick Actions</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="btn-primary" data-action="start-review" style="font-size:13px;">↺ Start Review</button>
          <button class="btn-secondary" data-action="upload" style="font-size:13px;">↑ Upload Notes</button>
          <button class="btn-secondary" data-action="new-plan" style="font-size:13px;">📅 New Plan</button>
        </div>
      </div>
    `;

    // double-rAF guarantees canvas is in the painted DOM before drawing
    if (nodes.length) requestAnimationFrame(() => requestAnimationFrame(() => this._drawDonut(nodes)));
    StreakTracker.render();

    // Single event delegation — prevents listener stacking on every refresh.
    // Set once on the stable container element, never re-bound.
    if (!this._delegated) {
      this._delegated = true;
      container.addEventListener('change', e => {
        const cb = e.target.closest('.task-check');
        if (!cb) return;
        const activePlan = PlanStore.getActive();
        if (!activePlan) return;
        const day  = activePlan.days.find(d => d.date === cb.dataset.dayDate);
        const task = day?.tasks.find(t => t.id === cb.dataset.taskId);
        if (task) {
          task.done   = cb.checked;
          task.doneAt = cb.checked ? Date.now() : null;
          PlanStore.save(activePlan);
          if (cb.checked) StreakTracker.recordActivity();
          this.refresh();
        }
      });
      container.addEventListener('click', e => {
        const launchBtn = e.target.closest('.task-launch-btn');
        if (launchBtn) {
          const { nodeId, activity } = launchBtn.dataset;
          if (nodeId?.startsWith('competency_')) {
            CompetencyView.open(nodeId.replace('competency_', ''));
          } else if (nodeId) {
            NodeDetailView.open(nodeId);
            if (activity === 'recall' || activity === 'application') {
              setTimeout(() => {
                NodeDetailView._currentSection = 'questions';
                document.querySelectorAll('.detail-nav-btn').forEach((b,i) => b.classList.toggle('active', i===1));
                NodeDetailView._renderSection();
              }, 150);
            }
          }
          return;
        }
        const compBtn = e.target.closest('[data-competency]');
        if (compBtn) { CompetencyView.open(compBtn.dataset.competency); return; }
        // Exam-readiness action rows: open the named topic, or route by kind.
        const openNode = e.target.closest('[data-open-node]');
        if (openNode) { if (typeof NodeDetailView !== 'undefined') NodeDetailView.open(openNode.dataset.openNode); return; }
        const rd = e.target.closest('[data-readiness]');
        if (rd) {
          ({ start:  () => App.navigateTo('library'),
             review: () => App.navigateTo('review'),
             drill:  () => App.navigateTo('review'),
             add:    () => App.navigateTo('upload'),
             maintain: () => App.navigateTo('review'),
          })[rd.dataset.readiness]?.();
          return;
        }
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (!action) return;
        ({ 'open-coach': () => StudyCoach.open(),
           'create-plan': () => StudyPlanBuilder.open(),
           'new-plan': () => StudyPlanBuilder.open(),
           'start-review': () => App.navigateTo('review'),
           'upload': () => App.navigateTo('upload'),
           'studyplan': () => App.navigateTo('studyplan'),
        })[action]?.();
      });
    }
  },

  _renderTodayPlan(plan) {
    const today     = StudyPlan._dateStr(new Date());
    const todayPlan = plan.days.find(d => d.date === today);
    const daysLeft  = plan.daysRemaining;
    const pct       = plan.progressPct;

    const planHeader = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <div>
          <div style="font-family:var(--font-ui);font-size:14px;font-weight:700;color:var(--text-primary);">${this._esc(plan.title)}</div>
          <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">${daysLeft} days to exam · ${pct}% complete</div>
        </div>
        <div class="progress-track" style="width:120px;height:5px;">
          <div class="progress-fill" style="width:${pct}%;height:5px;"></div>
        </div>
      </div>`;

    if (!todayPlan || !todayPlan.tasks.length) {
      return planHeader + `<div style="font-family:var(--font-mono);font-size:13px;color:var(--text-muted);padding:12px 0;">No tasks scheduled for today. 🎉</div>`;
    }

    const actIcon = t => ({ review:'📖', recall:'🔁', application:'🧩', summary:'📝', lecture:'🎓', competency:'🏆' }[t] || '📌');
    const tasks = todayPlan.tasks.map(task => `
      <div class="plan-task ${task.done ? 'done' : ''}">
        <input type="checkbox" class="task-check"
               data-day-date="${todayPlan.date}" data-task-id="${task.id}"
               ${task.done ? 'checked' : ''}
               style="accent-color:var(--accent);width:18px;height:18px;flex-shrink:0;cursor:pointer;"/>
        <div style="flex:1;min-width:0;">
          <div style="font-family:var(--font-ui);font-size:13px;font-weight:600;
               color:${task.done ? 'var(--text-muted)' : 'var(--text-primary)'};
               ${task.done ? 'text-decoration:line-through;' : ''}">
            ${actIcon(task.activityType)} ${this._esc(task.nodeTitle)}
          </div>
          <div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);">
            ${task.activityType} · ${task.estimatedMins} min
          </div>
        </div>
        ${!task.done ? `
          <button class="task-launch-btn btn-secondary"
                  data-node-id="${task.nodeId}" data-activity="${task.activityType}"
                  style="font-size:11px;padding:5px 10px;flex-shrink:0;">
            ${task.nodeId?.startsWith('competency_') ? '🏆 Test' : 'Open'}
          </button>` : '<span style="color:var(--green);font-size:16px;">✓</span>'}
      </div>`).join('');

    const done  = todayPlan.tasks.filter(t=>t.done).length;
    const total = todayPlan.tasks.length;
    return planHeader + `
      <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-bottom:10px;">
        ${done}/${total} tasks · ${todayPlan.totalMins} min total
      </div>
      <div style="display:flex;flex-direction:column;">${tasks}</div>`;
  },

  _drawDonut(nodes) {
    const canvas = document.getElementById('mastery-donut');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = 100, cy = 100, r = 80, inner = 52;
    const bands = [
      { label:'New (0%)',        color:'#2a2e38', count:0 },
      { label:'Learning 1–40%', color:'#f0615a', count:0 },
      { label:'Good 41–79%',    color:'#f0a500', count:0 },
      { label:'Mastered 80%+',  color:'#3ecf82', count:0 },
    ];
    nodes.forEach(n => {
      if (n.masteryScore === 0)      bands[0].count++;
      else if (n.masteryScore <= 40) bands[1].count++;
      else if (n.masteryScore <= 79) bands[2].count++;
      else                           bands[3].count++;
    });
    const total = nodes.length;
    let angle   = -Math.PI / 2;
    ctx.clearRect(0, 0, 200, 200);
    bands.forEach(b => {
      if (!b.count) return;
      const slice = (b.count / total) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + slice);
      ctx.closePath(); ctx.fillStyle = b.color; ctx.fill();
      angle += slice;
    });
    const bg = document.documentElement.classList.contains('light-theme') ? '#f0f2f5' : '#080a0d';
    ctx.beginPath(); ctx.arc(cx, cy, inner, 0, Math.PI*2);
    ctx.fillStyle = bg; ctx.fill();
    ctx.fillStyle = '#f0a500';
    ctx.font = 'bold 18px DM Mono, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(nodes.reduce((s,n)=>s+n.masteryScore,0)/total)+'%', cx, cy);
    const legend = document.getElementById('donut-legend');
    if (legend) legend.innerHTML = bands.filter(b=>b.count).map(b =>
      `<div class="dash-legend-item"><span style="background:${b.color};width:10px;height:10px;border-radius:2px;display:inline-block;"></span>${b.label} (${b.count})</div>`
    ).join('');
  },

  _esc: s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'),
};
