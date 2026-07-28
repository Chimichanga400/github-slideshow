/**
 * MatchOptions.js — turn a lettered-option question into structured, tappable
 * choices. Free, on-device, zero dependencies.
 *
 * Revision worksheets are full of matching / multiple-choice items where the
 * options (Column B) are flattened into the question text, one per line:
 *
 *     10. Current withholding tax on dividends
 *     A — 50%
 *     B — Medical aid contributions
 *     C — 20%
 *     …
 *     Q — 18%
 *
 * Rendered as a plain <textarea> ("Write a thorough answer…") this is unusable.
 * parse() pulls out the stem (Column A prompt) and the lettered options
 * (Column B) so the UI can show real tappable choices. Tapping a choice fills
 * the answer with the full "LETTER — text", which the free LocalGrader marks
 * instantly (its MCQ / containment rules match a bare letter, the value, or
 * the full option), so drilling these never costs an AI call.
 *
 * Conservative on purpose: only fires when there is a genuine in-order run of
 * lettered options starting at A (≥3), so ordinary prose is never mangled.
 */
const MatchOptions = {
  // A line that is a single lettered option: "A — text", "B) text", "C. text",
  // "d: text". Captures the letter and the option body. Letters A–Z so long
  // matching lists (A…Q) are supported, not just A–F.
  _LINE: /^\s*\(?([A-Za-z])\)?\s*[—–\-:.)]\s+(\S.*)$/,

  /** Break a single-line OCR blob ("… A) x B) y C) z") back onto one option per
   *  line. Self-contained (no dependency on KNText/global load order): needs an
   *  in-order A,B,C… run of ≥3 markers, so ordinary prose is never split. */
  _toLines(t) {
    if (/\n/.test(t)) return t.split('\n');
    const re = /\s\(?([A-Za-z])\)?\s*[—–\-:.)]\s+(?=\S)/g;
    let m; const found = [];
    while ((m = re.exec(t))) found.push({ letter: m[1].toUpperCase(), idx: m.index });
    const chain = []; let want = 'A';
    for (const f of found) {
      if (f.letter === want) { chain.push(f); want = String.fromCharCode(want.charCodeAt(0) + 1); }
    }
    if (chain.length < 3) return [t];
    const out = []; let last = 0;
    for (const c of chain) { out.push(t.slice(last, c.idx)); last = c.idx + 1; }
    out.push(t.slice(last));
    return out.filter((s, i) => i === 0 || s.trim());
  },

  /**
   * @param {string} questionText
   * @returns {{stem:string, options:{letter:string,text:string,raw:string}[]}|null}
   *          null when the text is not a lettered-option question.
   */
  parse(questionText) {
    const t = String(questionText == null ? '' : questionText);
    if (!t.trim()) return null;
    // Break a single-line OCR blob into one option per line first.
    const lines = this._toLines(t);

    const stemLines = [];
    const opts = [];
    let want = 'A';          // next letter we expect in the A,B,C… chain
    let started = false;     // have we entered the option block yet?

    for (const line of lines) {
      const m = line.match(this._LINE);
      const letter = m ? m[1].toUpperCase() : null;
      if (m && letter === want) {
        opts.push({ letter, text: m[2].trim(), raw: letter + ' — ' + m[2].trim() });
        want = String.fromCharCode(want.charCodeAt(0) + 1);
        started = true;
      } else if (!started) {
        stemLines.push(line);          // still in the prompt (Column A)
      } else {
        // An option's body wrapped onto a second line — append to the last one.
        if (line.trim() && opts.length) {
          const last = opts[opts.length - 1];
          last.text += ' ' + line.trim();
          last.raw = last.letter + ' — ' + last.text;
        }
      }
    }

    if (opts.length < 3) return null;  // not confidently a lettered-option set
    return { stem: stemLines.join('\n').trim(), options: opts };
  },

  /** The answer string to store when a given option letter is chosen. Using the
   *  full "LETTER — text" makes free grading robust whether the stored model
   *  answer is the letter, the value, or the full option. */
  answerFor(parsed, letter) {
    if (!parsed) return letter;
    const o = parsed.options.find(x => x.letter === String(letter).toUpperCase());
    return o ? o.raw : letter;
  },

  /** Given a saved answer string, which option letter (if any) does it name?
   *  Lets the UI re-highlight the chosen button when a paper is revisited. */
  letterOf(parsed, savedAnswer) {
    if (!parsed || !savedAnswer) return null;
    const s = String(savedAnswer).trim();
    // "C", "C — 20%", "(c)", "c)"
    const m = s.match(/^\(?([A-Za-z])\)?(?:\s*[—–\-:.)]|\s*$)/);
    if (m) {
      const L = m[1].toUpperCase();
      if (parsed.options.some(o => o.letter === L)) return L;
    }
    // Fall back: the saved text equals one option's body exactly.
    const low = s.toLowerCase();
    const hit = parsed.options.find(o => o.text.toLowerCase() === low || o.raw.toLowerCase() === low);
    return hit ? hit.letter : null;
  },
};
if (typeof window !== 'undefined') window.MatchOptions = MatchOptions;
if (typeof module !== 'undefined' && module.exports) module.exports = MatchOptions;
