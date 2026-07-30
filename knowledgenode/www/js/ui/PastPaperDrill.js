/**
 * PastPaperDrill.js — practice the REAL questions extracted from uploaded
 * past exam papers.
 *
 * Analysing a paper (UploadView → Past Exam Paper) stores each paper's
 * example questions with model answers per subject. Until now they only
 * steered question *generation*; this drill replays the authentic questions
 * themselves: answer → reveal the model answer → self-mark. No AI credits
 * needed — everything comes from the stored analysis, so it works offline.
 */
const PastPaperDrill = {
  _qs: [], _i: 0, _right: 0, _subject: '',

  _key(subject) { return 'kn_exam_style_' + String(subject || '').toLowerCase().replace(/\s+/g, '_'); },

  collect(subject) {
    try {
      const data = JSON.parse(localStorage.getItem(this._key(subject)) || '{"papers":[]}');
      const out = [];
      (data.papers || []).forEach(p => {
        ((p.analysis && p.analysis.examQuestions) || []).forEach(q => {
          if (q && q.question) out.push({
            question: q.question, marks: q.marks || 0, type: q.type || '',
            modelAnswer: q.modelAnswer || '', paper: p.name || 'Past paper',
          });
        });
      });
      return out;
    } catch (e) { return []; }
  },

  count(subject) { return this.collect(subject).length; },

  open(subject) {
    const qs = this.collect(subject);
    if (!qs.length) { if (window.Toast) Toast.info('No past-paper questions saved for this subject yet — upload a paper first.'); return; }
    // shuffle
    for (let i = qs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [qs[i], qs[j]] = [qs[j], qs[i]]; }
    this._qs = qs; this._i = 0; this._right = 0; this._subject = subject;
    this._render();
  },

  _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },

  _render() {
    if (this._i >= this._qs.length) return this._summary();
    const q = this._qs[this._i];
    Modal.open(
      '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-bottom:6px;">📝 Past Paper Practice — ' + this._esc(this._subject) + '</div>'
      + '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-bottom:14px;">Question ' + (this._i + 1) + ' of ' + this._qs.length
      + ' · from “' + this._esc(q.paper) + '”' + (q.marks ? ' · ' + q.marks + ' marks' : '') + (q.type ? ' · ' + this._esc(q.type) : '') + '</div>'
      + '<div style="font-family:var(--font-body);font-size:15px;line-height:1.65;color:var(--text-primary);background:var(--bg-raised);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px 16px;margin-bottom:14px;">' + (window.KNText ? KNText.html(q.question) : this._esc(q.question)) + '</div>'
      + '<textarea id="ppd-answer" class="config-input" rows="5" style="resize:vertical;touch-action:pan-y;margin-bottom:12px;" placeholder="Write your answer as you would in the exam…"></textarea>'
      + '<div id="ppd-reveal-zone"></div>'
      + '<div style="display:flex;gap:8px;">'
      + '<button class="btn-primary" id="ppd-reveal" style="flex:1;justify-content:center;">Reveal model answer</button>'
      + '<button class="btn-secondary" onclick="Modal.close()">Stop</button>'
      + '</div>'
    );
    setTimeout(() => {
      document.getElementById('ppd-reveal')?.addEventListener('click', () => {
        const zone = document.getElementById('ppd-reveal-zone');
        if (!zone) return;
        zone.innerHTML =
          '<div style="font-family:var(--font-mono);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--green);margin-bottom:6px;">✓ Model answer</div>'
          + '<div style="font-family:var(--font-body);font-size:14px;line-height:1.65;color:var(--text-primary);background:var(--green-dim);border:1px solid rgba(52,199,123,0.25);border-radius:var(--radius-md);padding:12px 14px;margin-bottom:12px;">' + (window.KNText ? KNText.html(this._qs[this._i].modelAnswer || 'No model answer captured for this question.') : this._esc(this._qs[this._i].modelAnswer || '')) + '</div>'
          + '<p style="font-family:var(--font-ui);font-size:13px;font-weight:600;margin-bottom:8px;">How did you do?</p>'
          + '<div style="display:flex;gap:8px;margin-bottom:12px;">'
          + '<button class="btn-secondary" id="ppd-right" style="flex:1;justify-content:center;">✓ Got it</button>'
          + '<button class="btn-secondary" id="ppd-wrong" style="flex:1;justify-content:center;">✗ Missed it</button>'
          + '</div>';
        const btn = document.getElementById('ppd-reveal'); if (btn) btn.style.display = 'none';
        document.getElementById('ppd-right')?.addEventListener('click', () => { this._right++; this._i++; this._render(); });
        document.getElementById('ppd-wrong')?.addEventListener('click', () => { this._i++; this._render(); });
      });
    }, 0);
  },

  _summary() {
    const n = this._qs.length, pct = n ? Math.round((this._right / n) * 100) : 0;
    const color = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--accent)' : 'var(--red)';
    const msg = pct >= 80 ? 'Exam-ready on these. Re-drill in a few days to lock it in.'
      : pct >= 50 ? 'Solid base — study the model answers you missed, then drill again.'
      : 'These are your highest-value study targets — the examiner literally asked them.';
    Modal.open(
      '<div style="text-align:center;padding:8px 0;">'
      + '<div style="font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-bottom:10px;">📝 Past Paper Practice — done</div>'
      + '<div style="font-family:var(--font-mono);font-size:44px;font-weight:800;color:' + color + ';">' + this._right + '/' + n + '</div>'
      + '<p style="font-family:var(--font-body);font-size:14px;color:var(--text-primary);line-height:1.6;margin:12px 0 18px;">' + msg + '</p>'
      + '<div style="display:flex;gap:8px;">'
      + '<button class="btn-primary" style="flex:1;justify-content:center;" onclick="Modal.close();PastPaperDrill.open(PastPaperDrill._subject)">Practice again</button>'
      + '<button class="btn-secondary" onclick="Modal.close()">Done</button>'
      + '</div></div>'
    );
  },
};
if (typeof window !== 'undefined') window.PastPaperDrill = PastPaperDrill;
