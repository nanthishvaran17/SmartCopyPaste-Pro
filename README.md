# SmartCopyPaste Pro

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-6366f1.svg?style=for-the-badge)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Tests Passing](https://img.shields.io/badge/Tests-13%2F13%20Passed-10b981.svg?style=for-the-badge)](tests/test-suite.js)
[![Chrome Extension](https://img.shields.io/badge/Platform-Chromium%20%7C%20Chrome-4f46e5.svg?style=for-the-badge)](https://www.google.com/chrome/)
[![AI Models](https://img.shields.io/badge/AI-Gemini%202.5%20%7C%20ChatGPT%20%7C%20Claude-ec4899.svg?style=for-the-badge)](https://ai.google.dev/)
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local%20%7C%20Zero%20Tracking-06b6d4.svg?style=for-the-badge)](README.md#privacy--security)

> **The World-Class AI-Powered Copy-Paste Manager, Web Intelligence Scanner, Question Extractor, and Human-Like Controlled Auto-Typing Engine.**

Built for competitive programmers, developers, students, and power users who need seamless clipboard capture, instant multi-AI code generation, and undetectable, human-paced or ultra-fast auto-typing into any web editor.

---

## 3-Step Magic Workflow

SmartPaste Pro eliminates complex configurations. Everything you need lives right on the Dashboard in an intuitive 1-2-3 flow:

```
+-------------------------------------------------------------------------+
|                         SMARTPASTE PRO DASHBOARD                        |
+-------------------------------------------------------------------------+
|                                                                         |
|  [1] GET TEXT OR CODE                                                   |
|      [ Grab Page Text ]   [ Paste Clipboard ]                           |
|      +---------------------------------------------------------------+  |
|      | paste code, question, or problem statement here...            |  |
|      +---------------------------------------------------------------+  |
|                                                                         |
|  [2] ASK AI (OPTIONAL - CLICK TO EXPAND)                                |
|      (o) Gemini 2.5 Flash   ( ) ChatGPT 4o   ( ) Claude 3.5             |
|      [ Solve Question / Fix Code ]   [ Open Web AI ]                    |
|      +---------------------------------------------------------------+  |
|      | AI Generated Solution -> [ Use for Typing ] [ Copy ]          |  |
|      +---------------------------------------------------------------+  |
|                                                                         |
|  [3] AUTO-TYPE INTO WEBPAGE                                             |
|      [ Pick Box on Page ]                                               |
|      Speed: [ Ultra (2500 WPM) ] [ Fast (800) ] [ Human (300) ] [ Instant ]
|                                                                         |
|      [======>>>  START AUTO-TYPING NOW  <<<======]                      |
|                                                                         |
+-------------------------------------------------------------------------+
```

---

## Key Highlights

### 1. Controlled Auto-Typing Engine (Universal Editor Support)
- **Zero-Detection Human Emulation**: Random keystroke interval delays (e.g., 30ms - 120ms) prevent contest platforms and form engines from flagging automated scripts.
- **Universal Code Editor Compatibility**: Natively types into **Monaco Editor**, **Ace Editor**, **CodeMirror (v5 & v6)**, standard `<textarea>`, and `contenteditable` elements (tested on LeetCode, HackerRank, CodeChef, Codeforces, and online assessment portals).
- **Flexible Speeds**:
  - **Ultra Mode (2500 WPM)**: Dumps 500 lines of code in 1-2 seconds with high-frequency UI yielding.
  - **Fast Mode (800 WPM)**: Rapid, steady execution.
  - **Human Mode (300 WPM)**: Natural, safe, human-paced typing with organic rhythm.
  - **Instant Mode (0ms delay)**: Direct atomic DOM insertion.

### 2. On-Page Floating Safety Widget & Emergency ESC Stop
- **Floating Status Pill**: During active typing, a sleek obsidian badge appears at the top-right of your active webpage:
  ```
  [ ● Auto-Typing: 45% (135/300) ] [ STOP (ESC) ]
  ```
- **Instant Emergency Halt**: Press the **`ESC` key** anywhere on your keyboard, or click the on-screen **`STOP`** button, to immediately abort typing before it alters any more code.
- **Cross-Tab & Popup Lifecycle Persistence**: Even if the extension popup closes or you switch tabs, auto-typing continues seamlessly. Re-opening the popup instantly reconnects to the live progress.

### 3. Multi-AI Intelligence Hub (Gemini, ChatGPT, Claude)
- **Google Gemini**: Powered by **Gemini 2.5 Flash** (`gemini-2.5-flash`) and `gemini-flash-latest` with automatic fallback.
- **OpenAI ChatGPT**: Powered by `gpt-4o-mini`.
- **Anthropic Claude**: Powered by `claude-3-5-haiku`.
- **1-Click Workflows**:
  - **Solve & Code**: Solves algorithmic problems and generates clean, production-ready code.
  - **Inline Key Setup**: Configure your API key directly inside the dashboard or in Settings.
  - **Web AI Fallback**: Open ChatGPT, Claude, or Gemini in a new browser tab with one click.

### 4. Interactive Screen Target Picker
- Click **"Pick Box on Page"** to enter visual element selection mode.
- Hovering over any input or code container illuminates a purple glowing bounding box.
- Click the target container to lock it as the active destination.

### 5. Website Content Intelligence & Question Extractor
- **1-Click Full Page Scan**: Extracts title, domain, headings (H1-H6), semantic paragraphs, code snippets, and structural metadata.
- **MCQ & Question Parser**: Detects numbered questions, question marks, and options (A-D) with confidence scoring.

### 6. Obsidian Cyber-Glass Aesthetic
- Engineered with a high-end **Linear / Arc / Raycast** inspired design system.
- Deep space obsidian background (`#07090e`), frosted glass cards (`backdrop-filter: blur(24px)`), and radiant jewel-tone badges (Cyan, Violet, Rose).
- Fixed 480px x 570px bounds with zero unwanted OS scrollbars.

---

## Speed & Configuration Matrix

| Preset | Speed (WPM) | Keystroke Delay | Detection Risk | Recommended Use Case |
| :--- | :---: | :---: | :---: | :--- |
| **Human Safe** | 60 - 300 | 30ms - 120ms (Random) | **Undetectable** | HackerRank, LeetCode, Exam Portals |
| **Fast** | 800 | 5ms - 15ms | Low | Forms, Assignments, Notes |
| **Turbo** | 2500 | 0ms - 2ms | High | Large files, repetitive data entry |
| **Instant** | Unlimited | 0ms (Atomic) | Immediate | Standard textareas, offline editors |

---

## Architecture

```
+-----------------------------------------------------------------------------------+
|                            CHROME EXTENSION RUNTIME                               |
+-----------------------------------------------------------------------------------+
                                        |
     +----------------------------------+----------------------------------+
     |                                  |                                  |
     v                                  v                                  v
+-----------------------+   +-----------------------+   +-----------------------+
|   POPUP CONTROLLER    |   |  BACKGROUND WORKER    |   |    CONTENT SCRIPT     |
|   (popup/popup.js)    |   |  (service-worker.js)  |   |  (content-main.js)    |
+-----------------------+   +-----------------------+   +-----------------------+
| - 1-Click Magic Flow  |   | - chrome.storage.local|   | - Monaco/Ace Injector |
| - Persistent Drafts   |   | - Multi-AI Dispatcher |   | - On-Screen Target Pick|
| - Live Progress Poller|   | - Context Menus       |   | - Floating STOP Widget|
| - Theme & UI Engine   |   | - Tab State Routing   |   | - ESC Key Listener    |
+-----------------------+   +-----------------------+   +-----------------------+
                                        |
                                        v
                            +-----------------------+
                            |     HOST WEBPAGE      |
                            | (DOM & Code Editors)  |
                            +-----------------------+
```

---

## Project Structure

```
SmartCopyPaste-Pro/
|-- manifest.json             # Manifest V3 extension configuration
|-- README.md                 # Project documentation & reference
|-- create-icons.py           # Pure Python PNG icon generator
|-- background/
|   `-- service-worker.js     # Background worker (AI router, storage, context menus)
|-- content/
|   |-- content-main.js       # Content engine (typing engine, target picker, floating badge)
|   `-- content-styles.css    # Injected styles for target highlights
|-- popup/
|   |-- popup.html            # Main popup dashboard (1-Click flow & advanced modules)
|   |-- popup.css             # Obsidian cyber-glass aesthetic stylesheet
|   `-- popup.js              # Frontend UI controller & state synchronizer
|-- options/
|   |-- options.html          # Extension options page
|   |-- options.css           # Options styling
|   `-- options.js            # Options settings controller
|-- icons/
|   |-- icon16.png            # 16x16 icon
|   |-- icon32.png            # 32x32 icon
|   |-- icon48.png            # 48x48 icon
|   `-- icon128.png           # 128x128 icon
`-- tests/
    `-- test-suite.js         # Automated test suite (13 comprehensive checks)
```

---

## Installation & Setup

1. Clone or download this repository:
   ```bash
   git clone https://github.com/nanthishvaran17/SmartCopyPaste-Pro.git
   ```
2. Open Google Chrome (or Brave, Edge, Opera, Arc).
3. Navigate to `chrome://extensions/` in the URL bar.
4. Toggle **Developer mode** in the top-right corner.
5. Click **Load unpacked** in the top-left corner.
6. Select the `SmartCopyPaste-Pro` folder.
7. Click the Extension puzzle icon in Chrome and **Pin SmartPaste Pro** to your toolbar.

---

## Desktop & Mobile Ecosystem

SmartPaste Pro is engineered to run seamlessly across all your devices: Windows PCs, Android smartphones, tablets, and Chromium desktop browsers.

### 1. Windows Desktop App (`SmartPastePro.exe`)
A native, lightweight standalone desktop software compiled for Windows (no heavyweight electron or node runtimes required):
- **Native OS Keystroke Emulation**: Uses Windows `SendKeys` and event hooks to automatically type or paste your code directly into **any open application** (VS Code, Notepad, Dev-C++, IntelliJ, Web Browsers, Discord, etc.).
- **Focus Countdown**: Provides a configurable countdown delay (1-15 seconds) so you can switch into your target window before typing starts.
- **Emergency Abort**: Press `ESC` or click `STOP` at any time to immediately kill active typing routines.
- **1-Click Desktop Installer**: Run `Install-SmartPastePro.bat` to instantly generate an official shortcut on your Windows Desktop.
- **Stand-alone Frameless Mode**: Launch the extension dashboard as an independent, frameless desktop window (`--app`) with zero browser toolbars.

### 2. Android APK & Mobile Experience
- **Automated Cloud APK Build**: Included `.github/workflows/build-apk.yml` uses GitHub Actions, JDK 17, and Capacitor Android to automatically compile `SmartPastePro-debug.apk` upon push or tag release. Download the ready-to-install `.apk` directly from GitHub Actions artifacts or Releases!
- **Progressive Web App (PWA)**: Navigate to `mobile/index.html` on your Android phone/tablet in Chrome, Edge, or Samsung Internet, and tap **"Add to Home screen"** to install it as a full-screen, standalone app with offline caching.
- **Kiwi / Lemur Mobile Browser**: On Android, install Kiwi Browser, navigate to `chrome://extensions`, enable Developer Mode, and load `SmartPastePro-Extension.zip` to enjoy the full extension popup directly on your mobile device.

### 3. Chromium Extension Distribution (`SmartPastePro-Extension.zip`)
- Pre-packaged ready-to-deploy zip archive containing all Manifest V3 assets, background service workers, and popup controls.
- Compatible with Chrome, Edge, Brave, Opera, and Vivaldi.

---

## Automated Verification Suite

SmartPaste Pro includes a standalone test suite covering Manifest V3 integrity, input sanitization, question parsers, tokenization algorithms, speed matrices, and UI constraints:

```bash
node tests/test-suite.js
```

### Test Suite Output:
```
====================================================
   SmartPaste Pro - Comprehensive Test Suite       
====================================================

  [PASS] Manifest V3 structure and permissions verification
  [PASS] Verify all 4 required PNG icons exist and have non-zero size
  [PASS] Security: Sensitive credentials and API tokens are rejected
  [PASS] Category Detection: Correctly classifies code, questions, articles, and text
  [PASS] Smart Paste: Text cleaning removes excessive whitespace and Windows CRLF
  [PASS] Question Extractor: Extracts numbered questions and MCQ choices A-D
  [PASS] Typing Engine: Keystroke delay calculation logic
  [PASS] Typing Engine: Tokenization for Character, Word, Line, and Paragraph modes
  [PASS] Data Architecture: Backup export and import schema fidelity
  [PASS] All mandatory project files are present and non-empty
  [PASS] Typing Engine: Ultra-high speed (up to 2500 WPM) and Instant mode handling
  [PASS] UI Integrity: Verify zero emojis in HTML, CSS, and JS
  [PASS] AI Hub: Multi-provider dispatch structure for ChatGPT, Claude, and Gemini

----------------------------------------------------
Results: 13 / 13 tests passed.
----------------------------------------------------
>>> ALL AUTOMATED TESTS EXECUTED AND PASSED SUCCESSFULLY! <<<
```

---

## Privacy & Security

- **100% Local Storage**: All clipboard history, settings, and snippets are stored exclusively inside `chrome.storage.local`.
- **Zero Third-Party Telemetry**: No external analytics, tracking pixels, or remote logging.
- **Credential Filter**: Built-in regex filters prevent passwords, API tokens, and authorization secrets from being accidentally saved to history.
- **Document Boundary Respect**: Content script functions run strictly on demand without injecting tracking scripts into unrelated tabs.

---

## License

This project is licensed under the MIT License. Contributions and feedback are welcome via GitHub Issues and Pull Requests.
