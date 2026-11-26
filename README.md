# Video Speed Controller (Google Chrome Extension)

A lightweight, powerful, and privacy-focused Chrome Extension built on **Manifest V3** that gives you complete control over HTML5 video playback speeds across the web, featuring 15 exact presets, macOS keyboard shortcuts, per-website speed memory, an on-screen HUD, and dynamic Single-Page Application (SPA) detection.

---

## Features

- **15 Playback Speed Presets**:
  `0.25x`, `0.50x`, `1.00x`, `1.25x`, `1.50x`, `1.75x`, `2.00x`, `2.25x`, `2.50x`, `2.75x`, `3.00x`, `3.25x`, `3.50x`, `3.75x`, `4.00x`
- **macOS Keyboard Shortcuts**:
  - **Increase Speed**: `Command + Shift + .`
  - **Decrease Speed**: `Command + Shift + ,`
  - **Reset Speed (1.00x)**: `Command + Shift + 0`
  - Re-configurable via `chrome://extensions/shortcuts`.
  - Built-in form typing guard prevents accidental triggers while typing in search boxes, comments, or inputs.
- **Per-Website Speed Memory**:
  - Remembers your preferred playback speed independently for each website (e.g. YouTube: 2.00x, Netflix: 1.50x, Vimeo: 1.75x).
  - Saved using `chrome.storage.local` with atomic domain keys (`site_${domain}`) to prevent cross-tab race conditions and persist across tab navigation and browser restarts.
- **On-Screen Speed Indicator (HUD)**:
  - Displays a semi-transparent dark HUD badge in the center of the video whenever the speed changes.
  - Automatically disappears after ~1.5 seconds with a smooth fade-out.
  - Fully compatible with HTML5 Fullscreen mode (`document.fullscreenElement`).
  - Transparent to clicks (`pointer-events: none`) so video scrubbing and controls are never blocked.
  - Programmatically constructed with `document.createElementNS` for strict Content Security Policy (CSP) compliance.
- **Dynamic Video Detection (SPA Compatible)**:
  - Uses debounced `MutationObserver` (150ms) and SPA navigation hooks (`yt-navigate-finish`, `pushState`, `replaceState`, `popstate`) to automatically apply your preferred speed when new videos are loaded dynamically without requiring a page refresh.
  - Captures `play` events instantaneously (0ms) so new videos inherit speed immediately upon playback.
  - Traverses open Shadow DOM roots to detect embedded web-component video players.
  - Multi-frame awareness: iframes lacking videos are prevented from hijacking popup communication or executing redundant operations.
- **Polished, Compact Popup**:
  - Real-time video detection and playback status.
  - 15 interactive preset buttons with active speed highlighting.
  - Slower, Faster, and Reset buttons.
  - Active website domain badge and memory indicator.

---

## Installation in Google Chrome (macOS)

### Option A: Install from Unpacked Folder (Recommended for Developers)

1. Open **Google Chrome**.
2. In the URL address bar, enter:
   ```text
   chrome://extensions
   ```
3. In the top-right corner of the Extensions page, turn **ON** the **Developer mode** toggle.
4. Click the **Load unpacked** button in the top-left menu.
5. In the file picker dialog, select the project directory:
   ```text
   /Users/ankurbajaj/Documents/Youtube Speed Controller
   ```
6. The **Video Speed Controller** extension will immediately appear in your extensions list.
7. Click the **Extensions puzzle icon** in Chrome's top toolbar and pin **Video Speed Controller** for quick access.

### Option B: Install from ZIP Package

1. Locate the packaged ZIP archive:
   ```text
   /Users/ankurbajaj/Documents/Youtube Speed Controller/video-speed-controller-v1.0.0.zip
   ```
2. Unzip the file into a folder of your choice:
   ```bash
   unzip video-speed-controller-v1.0.0.zip -d video-speed-controller
   ```
3. Open `chrome://extensions` in Google Chrome and enable **Developer mode**.
4. Click **Load unpacked** and select the unzipped `video-speed-controller` folder.

---

## Keyboard Shortcuts

| Action | macOS Shortcut | Windows / Linux Shortcut | Description |
| :--- | :--- | :--- | :--- |
| **Increase Speed** | `Command + Shift + .` | `Ctrl + Shift + .` | Steps up to the next preset speed (up to 4.00x) |
| **Decrease Speed** | `Command + Shift + ,` | `Ctrl + Shift + ,` | Steps down to the previous preset speed (down to 0.25x) |
| **Reset Speed** | `Command + Shift + 0` | `Ctrl + Shift + 0` | Immediately resets speed to 1.00x |

> [!TIP]
> **Customizing Shortcuts:**
> You can rebind any shortcut at any time by visiting `chrome://extensions/shortcuts` in Google Chrome or by clicking the **Configure ↗** link in the extension popup.

---

## Platform Compatibility

Targeted and tested for standard HTML5 video elements:
- **YouTube** (`youtube.com` and `youtube.com/shorts`)
- **Vimeo** (`vimeo.com`)
- **Coursera** (`coursera.org`)
- **Udemy** (`udemy.com`)
- **Netflix** (`netflix.com`)
- **Amazon Prime Video** (`primevideo.com`)
- **Disney+** (`disneyplus.com`)
- Any website utilizing standard `<video>` elements.

### Known Limitations
- **Encrypted / Proprietary DRM Canvases**: Some specific Widevine DRM streams or proprietary custom media engines may render frames directly onto Canvas or utilize native codecs that restrict rate adjustment at the browser/codec level.
- **Restricted Chrome Pages**: Chrome Extensions cannot run scripts on internal Chrome pages (`chrome://`, `chrome-extension://`, or the Chrome Web Store) due to browser security restrictions.

---

## Project Structure

```text
/Users/ankurbajaj/Documents/Youtube Speed Controller/
├── manifest.json                    # Manifest V3 configuration & commands API
├── background/
│   └── background.js                # Service worker for shortcut dispatch
├── content/
│   ├── content.js                   # Video detection, rate control, & HUD
│   └── content.css                  # On-screen speed indicator styles
├── popup/
│   ├── popup.html                   # Extension popup interface
│   ├── popup.js                     # Popup controller & storage sync
│   └── popup.css                    # Dark glassmorphism popup styling
├── icons/
│   ├── icon16.png                   # 16x16 icon
│   ├── icon32.png                   # 32x32 icon
│   ├── icon48.png                   # 48x48 icon
│   └── icon128.png                  # 128x128 icon
├── utils/
│   └── constants.js                 # Shared presets, math, & domain helpers
├── tests/
│   ├── test_logic.js                # Presets & math unit tests
│   ├── test_e2e_mock.js             # End-to-end component integration tests
│   ├── test_popup.js                # Popup UI & interaction tests
│   ├── run_all_tests.js             # Master test suite runner
│   └── test-page.html               # Interactive browser laboratory page
├── scripts/
│   ├── generate_icons.py            # High-resolution icon generator
│   └── package_extension.py         # ZIP packager
├── README.md                        # Documentation & setup guide
├── TEST_CHECKLIST.md                # Test checklist & QA audit report
└── video-speed-controller-v1.0.0.zip# Installable production package
```

---

## Running the Automated Test Suite

The extension comes with a 26-point automated test suite covering unit math, DOM binding, rate enforcement, HUD overlays, atomic storage persistence, multi-frame isolation, and keyboard shortcut routing.

Run all tests in terminal:
```bash
node tests/run_all_tests.js
```

To run interactive visual tests in Chrome:
1. Load the extension in Chrome.
2. Open `tests/test-page.html` in Chrome:
   ```text
   file:///Users/ankurbajaj/Documents/Youtube Speed Controller/tests/test-page.html
   ```
3. Experiment with the live canvas videos, dynamic video addition, and shortcut tests.

---

## Troubleshooting

- **Shortcut not responding?**
  Ensure your focus is not inside an active text input or comment field. If another extension has claimed the same shortcut, open `chrome://extensions/shortcuts` and reassign it.
- **YouTube reset the speed when changing videos?**
  Video Speed Controller includes an automatic observer that detects YouTube SPA navigation (`yt-navigate-finish`) and re-enforces your saved site speed. If you have another conflicting playback extension installed, disable it to prevent fighting over `video.playbackRate`.
- **Speed didn't change on a specific site?**
  Check if the video is loaded inside an iframe from a different domain. The extension includes `"all_frames": true` in `manifest.json` to handle iframes, but cross-origin security restrictions may apply if the iframe restricts script execution via sandbox attributes.
