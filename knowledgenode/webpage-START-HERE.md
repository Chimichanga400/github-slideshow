# KnowledgeNode — phone local-server version

This folder IS the whole app. No build step, no paywall — you (and anyone)
paste an AI key in Settings once.

## Run it on your phone
1. Unzip this folder onto your phone (e.g. into Documents/knowledgenode-web)
2. In your local-server app, set the **document root / serve folder** to this
   folder (the one containing `index.html`)
3. Start the server, open the address it shows (e.g. http://localhost:8080)
   in Chrome on the phone

## Turn on AI (once)
Settings (gear) → AI setup → paste a key from openrouter.ai/keys (recommended)
or console.anthropic.com → Save.

## Good to know
- Your notes/keys are saved in the browser you use — keep using the same one.
- Voice input (🎤) may be blocked on plain http — everything else works.
- Importing PDFs/photos needs internet (helper libraries load from a CDN);
  studying already-generated content works offline.
