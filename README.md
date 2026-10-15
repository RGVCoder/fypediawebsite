# Fypedia Web

This is a browser version of the Fypedia SwiftUI app. The static site lives in `dist/`. The original iOS project is maintained separately in the developer's `ScrollEd/Fypedia` folder and is not modified by this repository.

## Run locally

From this directory, serve `dist/` with any static server, for example:

```bash
python3 -m http.server 4173 --directory dist
```

Then open `http://localhost:4173`.

## Configuration and Google sign-in

The current public InsForge project URL and anon key are in `dist/config.js`. For local development, `.env.local` supplies these values to `npm run build` and is ignored by Git. The build accepts either `FYPEDIA_INSFORGE_URL`/`FYPEDIA_INSFORGE_ANON_KEY` or the iOS-style `INSFORGE_URL`/`INSFORGE_ANON_KEY`, including spaces around `=`. A bare InsForge hostname is converted to HTTPS. For deployment, provide the public URL and anon key as build environment variables. `FYPEDIA_OAUTH_REDIRECT_TO` is optional; if blank, the app returns to the current deployment path. Do not put a Google client secret or YouTube, TranscriptAPI, or Grok keys in the browser bundle.

In InsForge Auth, enable Google and register a Google OAuth web client. In Google Cloud, add the exact InsForge callback URL shown by your InsForge provider setup as an authorized redirect URI. In InsForge, allowlist the deployed site URL and each localhost callback URL used for development. The backend currently redirects to a shared Google consent screen branded “InstaCloud”; configure your own Google OAuth client and consent branding before production use. Confirm that InsForge provider identities are not merged with Apple users by email alone; existing Apple accounts should be linked only after the user authenticates to both identities through a verified account-linking flow.

The web app uses the InsForge browser SDK for email signup, password login, email verification, Google OAuth, PKCE callback exchange, refreshable sessions, profile writes, sign-out, and authenticated function calls. The Google redirect was verified to reach Google; the full consent and return flow still requires a test account and production provider configuration. The current Google flow uses InsForge's shared OAuth client, branded “InstaCloud”; InsForge logs report that a project-specific Google OAuth secret is missing.

## Included flows

- Email sign up/login with verification; no unauthenticated preview entry point
- Google OAuth entry point through InsForge
- Three-topic onboarding and daily goal selection
- Home, Library, and Profile navigation
- Topic selection, custom topics, removal, and appearance switching
- Session preparation state, embedded YouTube Shorts, knowledge checks, review, retry, and results
- Local learning stats stored in browser `localStorage`
- Live InsForge auth, email verification, profile sync, and account deletion
- Live YouTube search and transcript-grounded question generation through the deployed InsForge functions

The browser only contains the InsForge URL and anon key. YouTube, TranscriptAPI, and Grok credentials remain inside the deployed InsForge functions. Learning statistics in the web app are local to the browser; cross-device synchronization is not implemented by the current web backend contract.

Run `npm run lint`, `npm test`, and `npm run build` to check the static bundle. There is no TypeScript project in this repository; JavaScript syntax checking is the applicable local type/syntax gate.
