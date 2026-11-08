# StudyBuddy Companion 3.5.1 — Quest Board

The Chrome extension retains your custom sprite mascot, health, drag & drop, animation, settings cog and quick-tip chat.

## Quests
- Add up to **3 queued tasks**, each with a title and **1–240 minute** duration.
- **Start Session** activates the current task's timer and displays the mascot on webpages.
- **Pause** stops the timer and suspends health updates. The mascot keeps walking while tasks remain queued.
- **Finished** removes the current task, grants **25 EXP**, and pauses until you explicitly start the next task.
- Drag queued tasks to change their order. After a task starts, it stays first in the queue.
- **50 EXP per level**; EXP rolls over and increments Level. Each level gained awards one coin.
- When Buddy reaches 0 HP during a session, the timer pauses with its remaining time saved and Buddy's KO sprite remains visible. Start the session to restore Buddy and resume.
- The empty queue shows `00:00`. Health drops by 2 HP every 3 seconds after 15 seconds of idle and regenerates by 1 HP every 3 seconds after 5 seconds of sustained activity.
- Timers, tasks, HP, EXP and settings are shared in `chrome.storage.local` across tabs in the same Chrome profile.
- Toggle between light and dark mode from Settings; the selected theme is saved with your extension settings.
- The countdown can reach zero without automatically marking a task complete; press Finished when it is actually done.
- Health follows the existing idle/activity rule **only while a task session is running**.

## Installation
1. Extract the ZIP.
2. Open `chrome://extensions`. Enable Developer mode.
3. Click **Load unpacked** and select the extracted project folder.
4. Allow site access if prompted. Refresh your websites. Chrome's own pages are restricted.

Disable any previous StudyBuddy extension to avoid multiple mascots. For preserving an existing extension's storage, replace its unpacked files **in the same folder** and click Reload instead of loading a separate folder.

## Notes
- No remote servers, tracking or AI service; the Buddy chat provides scripted study prompts.
- If Chrome sleeps or suspends a tab, the timer is based on its stored deadline and catches up when resumed.
- Browser-only mascot: Chrome extensions cannot draw outside Chrome webpages.
