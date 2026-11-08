# StudyBuddy Desktop

StudyBuddy Desktop is a standalone Tauri app that matches the Chrome extension's quest board, focus timer, health and experience progression, coin rewards, reorderable queue, and Buddy Chat. Its animated companion floats above other apps while tasks remain queued after the first start. The desktop app uses the extension's 1–240 minute task range, 25 EXP task reward, and 50 EXP per level. Pausing a running task or letting it time out costs 10 HP and resets the focus streak. A timed-out task must be restarted before it can be finished for EXP.

Drag the companion to move it; right-click for walking, position-reset, and hide controls. Drag a task by its grip to reorder the queue. Desktop state is saved locally in the app's WebView storage and is not synchronized with Chrome. Existing desktop XP and energy are migrated to XP/levels and health the first time the new version runs; existing saves start with zero coins. Health uses Windows' last-input timestamp to detect idle/activity periods; the app does not record keystrokes or their contents.

Buddy Chat uses the same local Gemini service as the Chrome extension. Chat messages are sent to Google's Gemini API; the API key remains in the server process environment and is not saved by the desktop app.

Toggle between light and dark mode in Companion settings; the selected theme is saved with desktop state.

## Run Buddy Chat

From the repository root, install the Python service dependencies and start the API server in PowerShell:

```powershell
python -m pip install -r server/requirements.txt
$env:GEMINI_API_KEY = "your Gemini API key"
python -m uvicorn main:app --app-dir server --host 127.0.0.1 --port 8000
```

Leave that terminal open while using Buddy Chat. The main desktop app and its companion continue to work if the chat service is not running.

## Windows prerequisites

- Windows 10 or 11.
- Node.js 22.12 or newer and npm.
- Rust stable for the MSVC target. Install it with [rustup](https://rustup.rs/), then run `rustup default stable-x86_64-pc-windows-msvc` in PowerShell.
- Microsoft C++ Build Tools with the **Desktop development with C++** workload and a Windows 10 or 11 SDK. Install via [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
- Microsoft Edge WebView2 Runtime. It is included with most Windows 10/11 installations; if it is missing, install the Evergreen Runtime from [Microsoft's WebView2 page](https://developer.microsoft.com/microsoft-edge/webview2/).

## Run locally

From the repository root, enter the desktop app directory:

```powershell
cd .\studybuddy-desktop
```

Then install the JavaScript CLI and launch the app:

```sh
npm install
npm run start
```

## Build for Windows

```sh
npm run build
```

The NSIS installer is written under `src-tauri/target/release/bundle/nsis/`. Build on Windows with the MSVC toolchain; the installer uses WebView2 and can download its runtime installer when setting up a machine that does not already have the runtime.

These builds are not code-signed. Windows SmartScreen or antivirus software may still warn about or quarantine an unsigned installer; that is a signing/reputation issue, not a way to bypass security controls and not unique to Electron. Do not disable or work around those protections. For distribution, sign the installer with a trusted code-signing certificate and submit suspected false positives to the relevant security vendor.
