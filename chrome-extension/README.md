# Desktop Companion Chrome v2.3 — KO state and active HP recovery

## Features
- Approved v2.2 walking + idle sprites and shared HP/EXP.
- New static KO sprite when HP reaches 0; the mascot no longer walks, falls, or responds to dragging until **Restore health** is clicked in extension popup.
- HP: maximum 50, hidden numerical value.
- Random mascot idle drains 1 HP every 3 seconds after an uninterrupted 15-second idle grace period (first loss at ~18s).
- **Sustained, real keyboard/mouse activity** in the active focused tab heals 1 HP every 3 seconds after a 5-second activity streak (first gain at ~8s). Inactivity breaks the streak. A zero-HP mascot requires explicit restore rather than auto-revival.
- One Chrome-profile-local health/EXP record shared by all tabs; no multi-device syncing or single cross-browser process.
- No access to typed text, just activity-event timestamps; these are not saved.

## Install
1. Extract ZIP.
2. Open `chrome://extensions`, enable Developer mode, then **Load unpacked**. Select this folder.
3. Under Details, set Site access to **On all sites**.
4. Disable older mascot versions to prevent overlapping characters.
5. Reload existing websites, including YouTube, after installing.

## YouTube troubleshooting
- Site access must include `https://www.youtube.com/*` (On all sites works).
- YouTube changes pages via in-app navigation; injected content may be hidden beneath fullscreen videos or require page refresh.
- Check Console for `[Desktop Companion] Content script active; mascot created.`
- If it appears in DOM but not visible, it may be affected by site-level overlays and stacking context; normal HTML content scripts cannot appear over fullscreen video.
- Protected browser pages, Chrome Web Store and some browser special pages are restricted.

## Persistence and limits
Data is saved in `chrome.storage.local`, shared across tabs only for the same extension ID in a single Chrome profile. Installing a separate unpacked extension may start new data. Cross-browser syncing needs a cloud backend and browser-specific extension packages.

## Notes
This build has passed syntax and package checks; live Chrome behavior remains to be tested.
