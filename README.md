# Fypedia Web

This is a browser version of the Fypedia SwiftUI app. It is intentionally buildless: the static output lives in `dist/` and runs without a package install.

## Run locally

From this directory, serve `dist/` with any static server, for example:

```bash
python3 -m http.server 4173 --directory dist
```

Then open `http://localhost:4173`.

## Included flows

- Sign up/log in shell plus local preview mode
- Three-topic onboarding and daily goal selection
- Home, Library, and Profile navigation
- Topic selection, custom topics, removal, and appearance switching
- Session preparation state, embedded YouTube Shorts, knowledge checks, review, retry, and results
- Local learning stats stored in browser `localStorage`
- Live InsForge auth, email verification, profile sync, and account deletion
- Live YouTube search and transcript-grounded question generation through the deployed InsForge functions

The browser only contains the InsForge URL and anon key. YouTube, TranscriptAPI, and Grok credentials remain inside the deployed InsForge functions.
