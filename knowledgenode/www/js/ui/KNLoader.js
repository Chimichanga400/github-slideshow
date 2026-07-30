/**
 * KNLoader.js — shared premium loading visuals for the whole app.
 *
 * Provides one on-brand hexagon loader (tracing comet + breathing core + glow)
 * so every upload/processing flow looks consistent. Styles and the shared SVG
 * gradient are injected once, on load.
 *
 *   KNLoader.hex(size)        → returns hexagon loader markup (string)
 *   KNLoader.mount(el, size)  → renders the loader into an element (id or node)
 *   KNLoader.ensureStyles()   → injects keyframes + gradient def (idempotent)
 */
/**
 * KNText — shared question/answer text formatting for every practice surface.
 *
 * Imported revision questions keep verbatim line breaks (MCQ options on their
 * own lines, multi-line worked solutions), but innerHTML collapses "\n" to a
 * space — so options ran together into one unreadable paragraph. All question
 * and model-answer rendering goes through these helpers instead:
 *
 *   KNText.split(s) → plain text; if an MCQ's options were flattened onto one
 *                     line (OCR sometimes does this), puts each option back on
 *                     its own line. Requires an in-order A,B,C… chain of at
 *                     least 3 markers so normal prose is never touched.
 *   KNText.html(s)  → escaped HTML with line breaks preserved (\n → <br>).
 */
const KNText = {
  split(text) {
    const t = String(text == null ? '' : text);
    if (/\n/.test(t)) return t;                 // real line breaks — keep as-is
    const re = /\s([A-F])[.):]?\s+(?=["“(]?[A-Z0-9])/g;
    let m; const found = [];
    while ((m = re.exec(t))) found.push({ letter: m[1], idx: m.index });
    const chain = []; let want = 'A';
    for (const f of found) {
      if (f.letter === want) { chain.push(f); want = String.fromCharCode(want.charCodeAt(0) + 1); }
    }
    if (chain.length < 3) return t;             // not confidently an MCQ — leave alone
    let out = '', last = 0;
    for (const c of chain) { out += t.slice(last, c.idx) + '\n'; last = c.idx + 1; }
    return out + t.slice(last);
  },
  // "A Employees who earn…" reads as one run-on line, so give a confident
  // option run a consistent "A)" label and the letter stops colliding with the
  // option text. Only rewrites an in-order A,B,C… run of at least three, and
  // only where the option text starts with a capital, digit or quote, so
  // ordinary prose is never relabelled.
  _OPT: /^(\s*)\(?([A-Za-z])\)?(?:\s*[—–\-:.)]\s*|\s+(?=["“(]?[A-Z0-9]))\s*(\S.*)$/,
  label(text) {
    const lines = String(text == null ? '' : text).split('\n');
    const hits = []; let want = 'A';
    lines.forEach((l, i) => {
      const m = l.match(this._OPT);
      if (m && m[2].toUpperCase() === want) {
        hits.push(i); want = String.fromCharCode(want.charCodeAt(0) + 1);
      }
    });
    if (hits.length < 3) return text;
    hits.forEach(i => {
      const m = lines[i].match(this._OPT);
      lines[i] = m[1] + m[2].toUpperCase() + ') ' + m[3];
    });
    return lines.join('\n');
  },
  esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
  html(s) { return this.esc(this.label(this.split(s))).replace(/\n/g, '<br>'); },
};
if (typeof window !== 'undefined') window.KNText = KNText;

const KNLoader = {
  _OUTER: '50,4 89.8,27 89.8,73 50,96 10.2,73 10.2,27',
  _INNER: '50,22 74.2,36 74.2,64 50,78 25.8,64 25.8,36',

  ensureStyles() {
    if (!document.getElementById('kn-loader-styles')) {
      const s = document.createElement('style');
      s.id = 'kn-loader-styles';
      s.textContent = `
        @keyframes kn-hex-trace { to { stroke-dashoffset:-100; } }
        @keyframes kn-hex-pulse { 0%,100% { transform:scale(.78); opacity:.45; } 50% { transform:scale(1); opacity:1; } }
        @keyframes kn-glow { 0%,100% { filter:drop-shadow(0 0 3px rgba(240,165,0,.30)); } 50% { filter:drop-shadow(0 0 16px rgba(240,165,0,.72)); } }
        @keyframes kn-aurora { 0% { transform:translate(-12%,-8%) scale(1); } 50% { transform:translate(12%,10%) scale(1.25); } 100% { transform:translate(-12%,-8%) scale(1); } }
        @keyframes kn-fade-rise { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .kn-hex-wrap { display:inline-flex; align-items:center; justify-content:center; animation:kn-glow 2.2s ease-in-out infinite; }
        .kn-hex-track { fill:none; stroke:rgba(240,165,0,.14); stroke-width:5; }
        .kn-hex-trace { fill:none; stroke:url(#knhexgrad); stroke-width:5; stroke-linecap:round; stroke-dasharray:24 76; animation:kn-hex-trace 1.5s linear infinite; }
        .kn-hex-core  { fill:rgba(240,165,0,.16); transform-box:fill-box; transform-origin:center; animation:kn-hex-pulse 2.2s ease-in-out infinite; }
      `;
      document.head.appendChild(s);
    }

    // Shared gradient definition referenced by every hex via url(#knhexgrad)
    if (!document.getElementById('kn-loader-defs')) {
      const host = document.createElement('div');
      host.id = 'kn-loader-defs';
      host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
      host.innerHTML =
        '<svg width="0" height="0" aria-hidden="true"><defs>'
        + '<linearGradient id="knhexgrad" x1="0" y1="0" x2="1" y2="1">'
        + '<stop offset="0%" stop-color="#ffd266"/><stop offset="100%" stop-color="#f0a500"/>'
        + '</linearGradient></defs></svg>';
      (document.body || document.documentElement).appendChild(host);
    }
  },

  hex(size = 64) {
    this.ensureStyles();
    return `
      <span class="kn-hex-wrap" style="width:${size}px;height:${size}px;flex-shrink:0;">
        <svg viewBox="0 0 100 100" width="${size}" height="${size}" style="overflow:visible;">
          <polygon class="kn-hex-track" points="${this._OUTER}"/>
          <polygon class="kn-hex-core"  points="${this._INNER}"/>
          <polygon class="kn-hex-trace" points="${this._OUTER}" pathLength="100"/>
        </svg>
      </span>`;
  },

  mount(elOrId, size = 56) {
    const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
    if (el) el.innerHTML = this.hex(size);
  },
};

// Inject styles as soon as possible so static markup (e.g. #processing-status) animates.
if (typeof document !== 'undefined') {
  if (document.readyState !== 'loading') KNLoader.ensureStyles();
  else document.addEventListener('DOMContentLoaded', () => KNLoader.ensureStyles());
}

/* ───────────────────────────────────────────────────────────────────────────
 * KNFiles — save & print that actually work inside the Android WebView.
 * Uses the native KnowledgeNodeFiles bridge when present, else browser fallback.
 * ──────────────────────────────────────────────────────────────────────────*/
const KNFiles = {
  nativeAvailable() {
    try { return !!(window.KnowledgeNodeFiles && window.KnowledgeNodeFiles.saveToDownloads); }
    catch (e) { return false; }
  },

  _isWebView() {
    return !!window.Capacitor || /\bwv\b/.test(navigator.userAgent || '');
  },

  async save(filename, mime, data) {
    const type   = mime || 'application/octet-stream';
    const isText = /json|text|xml|html|csv|javascript/i.test(type) || typeof data === 'string';
    const blob   = (data instanceof Blob) ? data : new Blob([data], { type });

    // 1) Native bridge (Android) — the only thing that truly "downloads" in the app
    if (this.nativeAvailable()) {
      try {
        if (window.Toast) Toast.info('Saving ' + filename + '…');
        const b64 = await this._toBase64(blob);
        window.KnowledgeNodeFiles.saveToDownloads(filename, type, b64);
        return 'native'; // a knfiles:saved / knfiles:error event confirms the outcome
      } catch (e) { /* fall through */ }
    }

    // 2) Real browser (not a WebView) — <a download> works here
    if (!this._isWebView()) {
      try {
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: filename, style: 'display:none' });
        document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
        return 'browser';
      } catch (e) { /* fall through */ }
    }

    // 3) WebView WITHOUT the native bridge — never fail silently.
    //    For text (e.g. backup JSON) guarantee recovery via clipboard + a copyable panel.
    if (isText) {
      const text = (typeof data === 'string') ? data : await blob.text();
      let copied = false;
      try { await navigator.clipboard.writeText(text); copied = true; } catch (e) {}
      this._showTextFallback(filename, text, copied);
      return 'fallback';
    }

    if (window.Toast) Toast.error('Couldn’t save ' + filename + '. The file bridge isn’t in this build — rebuild with the native files bridge.');
    return 'failed';
  },

  print(html, jobName) {
    if (window.KnowledgeNodeFiles && typeof window.KnowledgeNodeFiles.printHtml === 'function') {
      window.KnowledgeNodeFiles.printHtml(html, jobName || 'KnowledgeNode');
      return 'native';
    }
    const win = window.open('', '_blank');
    if (!win) { try { if (window.Toast) Toast.error('Pop-up blocked — allow pop-ups and retry.'); } catch {} return 'blocked'; }
    win.document.write(html); win.document.close();
    return 'browser';
  },

  _toBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  },

  // Full-screen copyable panel so the user can always extract text data (backup JSON)
  _showTextFallback(filename, text, copied) {
    document.getElementById('kn-textfallback')?.remove();
    const el = document.createElement('div');
    el.id = 'kn-textfallback';
    el.setAttribute('data-kn-overlay', '');
    el.setAttribute('data-kn-close', '#kn-tf-close');
    el.style.cssText = 'position:fixed;inset:0;z-index:9500;background:var(--bg-base,#07080b);display:flex;flex-direction:column;padding:16px;gap:12px;';
    el.innerHTML = `
      <div style="font-family:var(--font-ui),sans-serif;font-weight:800;font-size:16px;color:#fff;">${filename}</div>
      <div style="font-family:var(--font-mono),monospace;font-size:12px;color:${copied ? 'var(--green,#34c77b)' : 'var(--accent,#f0a500)'};">
        ${copied ? '✓ Copied to clipboard — paste into a notes/text app and save as “' + filename + '”.' : 'Select all, copy, then paste into a text app and save as “' + filename + '”.'}
      </div>
      <textarea readonly style="flex:1;width:100%;resize:none;background:#0f1116;color:#cfd3dc;border:1px solid var(--border,#262a33);border-radius:10px;padding:12px;font-family:var(--font-mono),monospace;font-size:11px;line-height:1.5;">${text.replace(/</g,'&lt;')}</textarea>
      <div style="display:flex;gap:10px;">
        <button id="kn-tf-copy" style="flex:1;padding:13px;border:none;border-radius:10px;background:var(--accent,#f0a500);color:#060709;font-weight:700;font-size:15px;">Copy again</button>
        <button id="kn-tf-close" style="padding:13px 20px;border:1px solid var(--border,#262a33);border-radius:10px;background:transparent;color:#fff;font-size:15px;">Close</button>
      </div>`;
    document.body.appendChild(el);
    const ta = el.querySelector('textarea');
    el.querySelector('#kn-tf-copy').onclick = async () => {
      ta.select();
      try { await navigator.clipboard.writeText(text); } catch (e) { document.execCommand('copy'); }
      if (window.Toast) Toast.info('Copied.');
    };
    el.querySelector('#kn-tf-close').onclick = () => el.remove();
  },
};

if (typeof window !== 'undefined') {
  window.KNFiles = KNFiles;
  // Toast the outcome of native saves
  window.addEventListener('knfiles:saved', e => { try { if (window.Toast) Toast.info('Saved to Downloads: ' + e.detail); } catch {} });
  window.addEventListener('knfiles:error', e => { try { if (window.Toast) Toast.error('Save failed (' + e.detail + ')'); } catch {} });
}

/* ───────────────────────────────────────────────────────────────────────────
 * KNNav / KNBack — let the device back button navigate the app.
 * Modules register an overlay close-handler when they open something modal;
 * the hardware back button pops the most recent one. With nothing registered,
 * we step back a view (node-detail → library, sub-views → library) before
 * letting Android background the app.
 * ──────────────────────────────────────────────────────────────────────────*/
const KNNav = {
  _id: 0,
  _stack: [],
  register(closeFn) { const id = ++this._id; this._stack.push({ id, closeFn }); return id; },
  unregister(id) { this._stack = this._stack.filter(o => o.id !== id); },

  back() {
    // 1) Close the most recently opened registered overlay
    if (this._stack.length) {
      const top = this._stack.pop();
      try { top.closeFn(); } catch (e) {}
      return true;
    }
    // 2) Close any tagged overlay that registered declaratively
    const overlays = document.querySelectorAll('[data-kn-overlay]');
    if (overlays.length) {
      const top = overlays[overlays.length - 1];
      const closeSel = top.getAttribute('data-kn-close');
      const closeBtn = closeSel ? top.querySelector(closeSel) : null;
      if (closeBtn) closeBtn.click(); else top.remove();
      return true;
    }
    // 3) Step back through real navigation history — works for every page
    //    (top-level views, a specific node, a specific competency report),
    //    not just a fixed "always go to library" shortcut.
    if (window.App && typeof App.goBack === 'function' && App.goBack()) return true;
    // 4) Fallback for the rare case the stack is empty (e.g. the very first
    //    navigation right after a cold boot straight into a sub-view).
    if (window.App && App._currentView) {
      const v = App._currentView;
      const homes = ['upload', 'library', 'guided'];
      if (homes.indexOf(v) === -1) { App.navigateTo('library'); return true; }
    }
    // 5) Nothing to do in-app
    return false;
  },
};

if (typeof window !== 'undefined') {
  window.KNNav = KNNav;
  window.KNBack = () => { try { return !!KNNav.back(); } catch (e) { return false; } };
}
