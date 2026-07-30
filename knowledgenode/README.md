# KnowledgeNode

A study app that helps you learn faster from your own material — scan notes,
worked examples, revision questions or past papers, and drill them with spaced
repetition, an AI coach, and exam-mode practice.

Plain JavaScript, no framework. It runs as a normal web page, as a Capacitor
Android app, and on an iPad via Safari.

## What is in here

| Path | What it is |
|---|---|
| `www/` | **The app. Single source of truth.** All three shipped builds come from this. |
| `android-native/` | Java helpers for the Capacitor Android wrapper |
| `qa/` | Automated check suites (see below) |
| `README-BUILD.md` | How to turn `www/` into an installable Android app |
| `webpage-START-HERE.md` | The note that ships inside the plain-webpage zip |

### The three builds are all generated from `www/`

They used to be kept as three hand-synced copies, which is how they drifted.
They are byte-identical, so only `www/` is committed:

1. **Android** — zip `android-native/`, `www/`, `README-BUILD.md` together.
2. **Plain webpage** — the *contents* of `www/` flat (no `www/` prefix), plus
   `webpage-START-HERE.md` renamed to `START-HERE.md`.
3. **Static host (Netlify/Vercel)** — same flat layout as the webpage build.

```sh
# from this directory
rm -rf build && mkdir -p build/webpage

# 1. Android zip
zip -qr build/KnowledgeNode-android-free.zip android-native www README-BUILD.md

# 2 & 3. Flat webpage zip
cp -r www/. build/webpage/
cp webpage-START-HERE.md build/webpage/START-HERE.md
( cd build/webpage && zip -qr ../KnowledgeNode-webpage.zip . )
```

### Cache-busting

`www/index.html` stamps every script and stylesheet with `?v=<build number>`.
**Bump it on every change**, or devices keep serving the old cached files and
your changes appear not to have shipped:

```sh
sed -i 's/v=1783000039/v=1783000040/g' www/index.html
```

The number in `index.html` is also what the in-app build stamp shows, so you can
confirm on the device which build you are actually running.

## Running the checks

```sh
cd qa
npm install     # jsdom + fake-indexeddb, first time only
npm test        # runs every suite
```

`npm test` loads the entire app in a headless DOM exactly as a browser does, so
any parse or start-up breakage in any file shows up immediately. To check a
different build directory:

```sh
WWW=/path/to/some/www npm test
```

### Real-browser checks

`qa/browser/` drives the app in an actual Chromium browser — real clicks, real
`localStorage`, real `fetch` — and saves screenshots. It includes a mock AI
server so every AI code path can be exercised **without an API key**, because it
serves the app and a fake OpenAI-compatible endpoint from the same origin (the
app's CSP allows `connect-src 'self'`). See `qa/browser/README.md`. These need
Playwright, so they are kept out of `npm test`.

### The suites

| Suite | Covers |
|---|---|
| `boot-smoke-check` | The whole app parses, boots, and every core singleton comes up with no errors |
| `coach-memory-check` | The study coach remembers what it has been told and stops re-asking |
| `match-options-check` | Lettered multiple-choice options parse into tappable choices |
| `match-integration-check` | Tapping an option fills and grades the answer |
| `match-group-check` | A match-and-pair set is reassembled from its individual items |
| `match-group-integration-check` | The two-column matcher renders, pairs, and marks for free |
| `grader-numbers-check` | Amounts like `R 100 000` grade on-device instead of costing AI credits |
| `exam-selection-check` | Mock exams weight toward weak/due/exam-relevant questions |
| `leech-intervention-check` | Repeatedly-failed cards stop being drilled and prompt understanding instead |

## Design notes worth knowing

- **Free-first grading.** `LocalGrader` and the matching graders answer on-device
  wherever they confidently can, so drilling multiple-choice and matching
  questions costs no AI credits. Only genuinely open answers go to the AI, and
  those are marked in one batched call per paper.
- **One coaching brain.** The Study Coach and the Socratic Tutor are two views
  over `CoachEngine` — one conversation, one memory, one AI path.
- **Coach memory.** `CoachFacts` stores keyed facts the student states (exam
  dates, daily study time, subject list) on-device and replays them into every
  turn, so they cannot roll out of the conversation window. Corrections reuse the
  key and replace the old value.
- **Feature list is data.** `www/js/core/AppFeatures.js` is the single source of
  truth for what the app can do; the coach reads it automatically. Update it when
  you add a feature and no other wiring is needed.
