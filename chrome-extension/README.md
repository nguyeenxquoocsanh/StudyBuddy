# StudyBuddy Companion 3.3 — Quest Board

The Chrome extension retains your custom sprite mascot, health, drag & drop, animation, settings cog and quick-tip chat.

## Quests
- Add up to **3 queued tasks**, each with a title and **1–240 minute** duration.
- **Start Session** activates the current task's timer and displays the mascot on webpages.
- **Pause** stops the timer, hides the mascot and suspends health and EXP updates.
- **Finished** removes the current task, grants **25 EXP**, and pauses until you explicitly start the next task.
- **50 EXP per level**; EXP rolls over and increments Level.
- Timers, tasks, HP, EXP and settings are shared in `chrome.storage.local` across tabs in the same Chrome profile.
- The countdown can reach zero without automatically marking a task complete; press Finished when it is actually done.
- At 0 HP the mascot shows its KO sprite and stays still until restored using Settings.
- Health follows the existing idle/activity rule **only while a task session is running**.

## Installation
1. Extract the ZIP.
2. Open `chrome://extensions`. Enable Developer mode.
3. Click **Load unpacked** and select the extracted project folder.
4. Allow site access if prompted. Refresh your websites. Chrome's own pages are restricted.

Disable any previous StudyBuddy extension to avoid multiple mascots. For preserving an existing extension's storage, replace its unpacked files **in the same folder** and click Reload instead of loading a separate folder.

## Notes
- Buddy Chat can connect to the local FastAPI Gemini service; keep `GEMINI_API_KEY` in the server process environment.
- If Chrome sleeps or suspends a tab, the timer is based on its stored deadline and catches up when resumed.
- Browser-only mascot: Chrome extensions cannot draw outside Chrome webpages.
