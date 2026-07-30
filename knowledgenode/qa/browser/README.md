# Browser checks

The suites in `../` run the app in a headless DOM. These drive it in a **real
Chromium browser** — real rendering, real clicks, real `localStorage`, real
`fetch` — and save screenshots you can look at.

They need Playwright and a Chromium build, which the headless suites do not, so
they are deliberately kept out of `npm test`.

```sh
cd knowledgenode/qa/browser
node mock-ai-server.js 8099 &          # serves the app AND a fake AI endpoint
node feature-sweep.js                  # every feature, no AI key needed
node matching-drive.js                 # the two-column matcher in detail
node ai-sweep.js                       # every AI path, against the mock
kill %1
```

Screenshots land in `shots/`.

## Why a mock AI instead of a real key

`mock-ai-server.js` serves the app **and** an OpenAI-compatible endpoint from
the *same origin*. That matters: the app's Content-Security-Policy allows
`connect-src 'self'`, so a same-origin endpoint is reachable while an arbitrary
localhost port would be blocked.

Point the app at it and every AI code path runs for real — request building,
HTTP, JSON parsing, hidden-tag extraction, memory, error handling — with no API
key, no cost, no rate limits, and identical results every run:

```js
AIService.saveConfig('custom', 'test-key', 'mock-model',
                     'http://127.0.0.1:8099/v1/chat/completions');
```

It replies based on the output contract the app states in its own prompt, so it
stays honest about shape. It can also force failures, to prove the app handles
them:

```
POST /__fail/500/v1/chat/completions   → server error
POST /__fail/429/v1/chat/completions   → rate limit
GET  /__calls                          → every request the app made
GET  /__reset                          → clear the recorded calls
```

**What this cannot tell you:** whether the model's *answers are any good*. It
verifies the plumbing around the model, not the model. Judging answer quality —
is the coach's advice sound, are extracted questions faithful to the worksheet,
are the slides accurate — needs a real key and a human reading the output.

## Testing with a real key

Configure a real provider in the app's own Settings → AI panel and use it
normally. Do not hard-code a key into these files or paste one into a commit,
an issue, or a chat log; anything committed to git is effectively public and
should be rotated if it leaks.
