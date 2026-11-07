# StudyBuddy Desktop

StudyBuddy Desktop is a standalone Tauri app based on the StudyBuddy browser extension. It keeps the 25-minute focus timer, buddy chat prompts, feeding rewards, and saved XP, energy, and treats.

The desktop app is a separate project from the browser extension. Its buddy chat uses local scripted prompts, and game state is saved in the webview's local storage.

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
