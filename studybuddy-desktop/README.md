# StudyBuddy Desktop

StudyBuddy Desktop is a standalone Electron app based on the StudyBuddy browser extension. It keeps the 25-minute focus timer, buddy chat prompts, feeding rewards, and saved XP, energy, and treats.

## Requirements

- Node.js 22.12 or newer
- npm

## Run locally

From this directory:

```sh
npm install
npm start
```

## Package for your current platform

```sh
npm run dist
```

Electron Builder writes installers or distributables to `release/`. To target a specific platform, append its builder option, for example `npm run dist -- --win`, `npm run dist -- --mac`, or `npm run dist -- --linux`. macOS packages generally need to be built on macOS, and Windows packages should be built on Windows.

The renderer runs with context isolation, sandboxing, and Node integration disabled. The preload bridge exposes only the current platform string; no filesystem or shell APIs are available to the page.
