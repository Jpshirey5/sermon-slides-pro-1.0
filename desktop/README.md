# Sermon Slide Pro desktop app

The desktop app is how churches present on Sunday. It runs the same React app as the website, from files inside the app, so it starts without internet. On top of that it adds:

- **Native screens.** The main screen and the stage display open full screen on the screen you pick, with no browser prompts.
- **An offline copy of each service.** Every time a service loads, an encrypted copy is saved on the computer. If the internet drops, the workspace keeps presenting from that copy.
  - It's encrypted with a key kept by the computer's keychain (macOS Keychain, Windows DPAPI).
  - It expires within 24 hours and never outlasts the scripture's 30 day limit.
  - Expired copies are deleted every time the app starts.
  - If the church loses access, the copy is deleted.
  - Nothing is saved if the computer can't encrypt it.
- **Automatic updates** from GitHub Releases. Updates install when the app is quit, never during a service.

Pages in the app have no access to the computer. The only bridge is a small fixed API (`window.sspDesktop`, see `src/preload.ts`). DevTools are off in release builds.

## Running it

From this folder:

```bash
npm install
npm start
```

`npm start` builds the web app (`vite build` in the project root), copies it into `desktop/web`, compiles the desktop code, and opens the app.

To work against the running dev server instead (hot reload), start `npm run dev` in the project root, then:

```bash
npm run dev
```

## Tests

```bash
npm test
```

## Building installers

```bash
npm run dist:mac
npm run dist:win
```

Installers land in `desktop/release`. Without signing they still work, but Mac and Windows warn that the app is from an unidentified developer.

### Signing (needed before handing it to churches)

- **Mac:** an Apple Developer ID certificate. Set `CSC_LINK` (the .p12) and `CSC_KEY_PASSWORD`. For notarizing, also set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, and change `notarize` to `true` in `electron-builder.yml`.
- **Windows:** a code signing certificate. Set `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`.

## Releasing an update

1. Bump `version` in `desktop/package.json`.
2. With a GitHub token in `GH_TOKEN` (and the signing variables above), run `npm run release`. That builds both installers and publishes them to a GitHub Release on Jpshirey5/sermon-slides-pro-1.0.
3. Installed apps find the new version within six hours, download it, and install it the next time they're quit.

## Notes

- The app loads from `ssp://app`. Supabase functions only allow the website's origins, so for Supabase responses to our own pages, the app sets the allowed origin to `ssp://app` (see `src/cors.ts`). Nothing else is changed.
- Signing in works the same as the website. The session lasts until the app is closed.
- The app icon is the landing page nav logo (gold circle, open book): `resources/icon.svg`, rendered to `resources/icon.png` (1024px). The installer tool makes the Mac and Windows icons from the PNG.
- The desktop app opens to a sign-in screen only. Sign-up, password help, and legal pages open on the website in the browser; marketing and guest pages never show in the app (see `src/desktop/routes.ts` in the web app).
