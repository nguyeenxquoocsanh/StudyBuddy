# StudyBuddy Companion 3.4.1 — Empty Queue Timer

Only the no-task timer was changed.

- With no tasks queued, the timer reads **00:00** and the subtitle reads **NO TASK SELECTED**.
- When you add a task, its chosen duration becomes the timer.
- Queues, focus controls, appearance, and mascot behavior otherwise remain unchanged.

To preserve existing stats, replace files in the previously loaded unpacked extension folder and click Reload at chrome://extensions.


## v3.4.2
- Added level readout beside the webpage mascot HP/EXP bars
- Centered the overlay bars above the mascot for cleaner alignment

## v3.4.3 — Double idle damage

- Damage is 2 HP every 3 seconds after the unchanged 15-second idle grace period.
- HP regeneration remains 1 HP every 3 seconds after 5 seconds of activity.
- All other behavior is unchanged.


## v3.4.4
- Added level-up visual effects to the webpage mascot overlay
- A coin pops above the mascot and a level-up badge appears beside the level when EXP rolls over
- Both effects fade in and out within 1 second


## v3.4.5
- Added a coin wallet to the popup header using the same coin sprite
- Each level-up now awards 1 coin
- Coin total is saved with the shared pet stats and updates live in the popup


## v3.4.6 — Mascot stays while quests remain
- The mascot first appears when you start a quest, not just when you add a task.
- Finishing a quest with tasks still queued keeps the mascot visible (motion and HP remain paused until Start Session).
- Pausing the timer now keeps the mascot visible while freezing movement and HP changes.
- When Finished empties the queue, the mascot stays briefly for existing level-up effects, then fades away over 650ms.
- Completing a quest still gives 25 EXP and 1 coin for every level gained.


## v3.4.7: Wider companion HUD
- HP/EXP bars doubled from approximately 90px to 180px each.
- Bars and level badge stay horizontally centered as one unit above the mascot.
- Both the coin and Level Up visual effects appear above the bars for up to 1 second.
- Removed the baked-in outside white background from the Level Up art.
- All queue visibility, HP, EXP and coin wallet behavior preserved.

## v3.4.8 — HUD and task ordering
- Shortened the webpage health and EXP bars from 180px to 126px (30%).
- Recentered the HUD automatically using its existing center transform.
- Reused the Level Up and coin effects above the smaller bars.
- Drag any unstarted task up or down to reorder the queue. Changes are saved in `studyBuddyV2`.
- Once a task starts, it stays in first place; remaining queued tasks can still be reordered.
- The next task after Finished follows the saved queue order.

## v3.4.9 — One initial drop per quest queue

- Starting the first quest in an unstarted queue drops the mascot from the top.
- Pausing and resuming the current quest never resets mascot position.
- Finishing a task while tasks remain keeps the mascot at its current position.
- Starting the next queued task does not drop or teleport the mascot.
- A new webpage opened after deployment places its mascot at the bottom rather than re-dropping it.
- After the final task finishes, the existing fade-out remains unchanged.
- The next NEW queue receives one initial drop when its first session is started.
- Use the explicit **Reset position** control to manually trigger a drop.

## v3.5.0 — Continuous mascot animation between tasks
- Once first deployed, the mascot keeps walking, idling, and animating while tasks remain queued.
- Clicking Finished with more queued tasks does not freeze or re-drop the mascot.
- HP gain/loss remains frozen whenever the focus session is not running.
- The Pause walking setting can still pause the mascot animation independently.
- Existing first-drop and final-task fade-out behavior are retained.
