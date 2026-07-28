/**
 * CoachFacts.js — durable memory of what the student has actually TOLD the coach.
 *
 * The conversation window is finite: older turns roll off, so a fact stated ten
 * messages ago ("my exam is the first week of December", "I can do 30 minutes
 * morning and evening", "I'm only doing 4 subjects this year") used to vanish
 * and the coach would ask for it again. That is infuriating and makes the coach
 * feel broken.
 *
 * Facts are KEYED, stored on-device, and injected into EVERY coach turn's system
 * prompt, so they never roll off no matter how long the conversation runs and
 * they survive closing the app. Because they are keyed, a correction OVERWRITES
 * the old value instead of piling up a contradiction — "scrap August, it's
 * December" replaces the date rather than adding a second one.
 *
 * The coach records them the same proven way it records [[SIGNAL:...]]: by
 * appending a hidden [[FACT: key = value]] line, so there is no extra AI call
 * and no extra cost.
 *
 * Free, on-device, zero dependencies.
 */
const CoachFacts = {
  KEY: 'kn_coach_facts',
  MAX: 30,                 // plenty for a study profile; oldest-touched drop first

  /** Canonical key: "Exam date", "exam_date" and "EXAM  DATE" are the same fact. */
  _norm(key) {
    return String(key == null ? '' : key)
      .toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 48);
  },

  _read() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.KEY) || '{}');
      return (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
    } catch (e) { return {}; }
  },

  _write(obj) {
    try { localStorage.setItem(this.KEY, JSON.stringify(obj)); return true; }
    catch (e) { return false; }
  },

  /** Every stored fact, most recently stated last. */
  all() {
    return Object.entries(this._read())
      .map(([key, v]) => ({ key, value: v && v.value, at: (v && v.at) || 0 }))
      .filter(f => f.value)
      .sort((a, b) => a.at - b.at);
  },

  get(key) {
    const f = this._read()[this._norm(key)];
    return f ? f.value : null;
  },

  /** Record (or correct) one fact. Empty value deletes it. */
  set(key, value) {
    const k = this._norm(key);
    if (!k) return false;
    const val = String(value == null ? '' : value).trim().slice(0, 300);
    const store = this._read();
    if (!val) { delete store[k]; return this._write(store); }
    store[k] = { value: val, at: Date.now() };
    // Cap: drop the least-recently-stated facts.
    const keys = Object.keys(store);
    if (keys.length > this.MAX) {
      keys.sort((a, b) => (store[a].at || 0) - (store[b].at || 0))
          .slice(0, keys.length - this.MAX)
          .forEach(k2 => delete store[k2]);
    }
    return this._write(store);
  },

  remove(key) { return this.set(key, ''); },

  clear() { try { localStorage.removeItem(this.KEY); return true; } catch (e) { return false; } },

  /**
   * Pull [[FACT: key = value]] lines out of a coach reply.
   * @returns {{clean:string, facts:{key:string,value:string}[]}}
   */
  parse(raw) {
    const str = String(raw == null ? '' : raw);
    const facts = [];
    const re = /\[\[FACT:\s*([^=\]]+?)\s*=\s*([^\]]*?)\s*\]\]/gi;
    let m;
    while ((m = re.exec(str))) {
      const key = this._norm(m[1]);
      if (key) facts.push({ key, value: String(m[2] || '').trim() });
    }
    const clean = str.replace(/\n?\[\[FACT:[^\]]*\]\]\n?/gi, '\n').replace(/\n{3,}/g, '\n\n').trimEnd();
    return { clean, facts };
  },

  /** Parse a reply AND persist whatever it recorded. Returns the cleaned text. */
  absorb(raw) {
    const { clean, facts } = this.parse(raw);
    facts.forEach(f => this.set(f.key, f.value));
    return clean;
  },

  /** The block injected into every coach system prompt. '' when nothing known. */
  block() {
    const list = this.all();
    if (!list.length) return '';
    const label = k => k.replace(/_/g, ' ');
    return '\n\nCONFIRMED FACTS THE STUDENT HAS ALREADY TOLD YOU'
      + ' (durable memory — these came from earlier in this conversation and are still true):\n'
      + list.map(f => '- ' + label(f.key) + ': ' + f.value).join('\n')
      + '\nTREAT THIS BLOCK AS AUTHORITATIVE. Never ask the student for anything already answered here —'
      + ' asking again makes you look like you were not listening. If a fact here conflicts with the app'
      + ' data above (for example a stale or deleted study plan), the fact here WINS, because the student'
      + ' said it directly; you may briefly note the mismatch, but do not re-interrogate them.'
      + ' If the student corrects one of these, re-record it with the same key so the correction replaces it.';
  },
};
if (typeof window !== 'undefined') window.CoachFacts = CoachFacts;
if (typeof module !== 'undefined' && module.exports) module.exports = CoachFacts;
