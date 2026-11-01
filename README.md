# SmartCopyPaste-Pro

> Advanced Chrome Extension (Manifest V3) – Smart Copy-Paste Manager, Website Content Intelligence, Question Extractor, and Ultra-Fast Controlled Typing Engine.

---

## Features

### 1. Smart Clipboard Manager
- **Clipboard Capture**: One-click capture of current clipboard text or manual text input with customizable labels and categories.
- **Categorization**: Automatic or manual classification into Questions, Answers, Paragraphs, Source Code, Notes, Articles, and General Text.
- **Context Menu Integration**: Right-click any selected text on any webpage and select "Save to SmartPaste Pro".
- **History & Instant Search**: Real-time search across saved texts, labels, and categories.
- **Privacy Protection**: Built-in credential filter that automatically rejects passwords, API keys, and bearer tokens.

### 2. Smart Paste Engine
- **Text Analysis**: Live structure breakdown displaying character count, word count, line count, and paragraph count.
- **Clean Text**: Strips unnecessary carriage returns, double-spaces, and tabs.
- **Format Text**: Standardizes spacing between paragraphs and sentences.
- **Direct Extraction**: Extract numbered questions, MCQ choices, or paragraph blocks directly from raw pasted text.
- **One-Click Actions**: Save to clipboard history, copy to clipboard, export as `.txt`, or send directly to the Typing Engine.

### 3. Website Intelligence Scanner
- **One-Click Page Scanning**: Scans the active webpage upon explicit user interaction.
- **Semantic Extraction**: Extracts page title, domain, headings (H1–H6), paragraphs, code blocks, lists, and questions.
- **Interactive Actions**: Copy individual headings, paragraphs, or code snippets with one click, or export the entire page analysis as structured JSON.
- **Respects Site Boundaries**: Only inspects visible content; never bypasses authentication or paywalls.

### 4. Question & MCQ Extractor
- **Boundary Detection**: Accurately recognizes numbered questions (e.g., `1.`, `Q1.`, `1)`), standalone questions (`?`), and multiple-choice options (`A.`, `B.`, `C.`, `D.`).
- **Confidence Scoring**: Displays extraction confidence percentage based on structural indicators.
- **Batch Operations**: Copy single questions, copy all formatted questions, save to clipboard history, or export to `.txt`.

### 5. Controlled Typing Engine (Ultra Speed & Instant)
- **Granular Modes**:
  - **Instant Mode**: Inserts complete text instantaneously (0 ms delay).
  - **Character Mode**: Keystroke by keystroke insertion with configurable interval.
  - **Word Mode**: Inserts word by word, preserving punctuation and whitespace.
  - **Line Mode**: Inserts line by line with customizable delay.
  - **Paragraph Mode**: Inserts full paragraphs with deliberate pauses.
- **Speed Presets**:
  - **Normal**: 60 WPM
  - **Fast**: 180 WPM
  - **Ultra**: 500 WPM
  - **Extreme**: 1000 WPM
  - **Turbo**: 2500 WPM
  - **Instant**: 0 ms delay
- **Saved Clipboard Selector**: Direct dropdown inside the typing tab to load any saved clipboard item in one click.
- **Target Field Detection**: Identifies visible, editable `input[type="text"]`, `textarea`, and `contenteditable` elements, skipping password and disabled fields, with visual purple outline highlighting.
- **Controls**: Interactive Start, Pause, Resume, Stop, and Restart controls with live progress bar and speed stats.

### 6. Premium User Interface
- 480px modern layout styled with clean typography, rounded cards, and smooth transitions.
- Seamless 8-tab navigation with zero overflow or cut-off text: **Dashboard**, **Clipboard**, **Paste**, **Scanner**, **Questions**, **Typing**, **History**, and **Settings**.
- Dark and Light themes with instant toggle.
- 100% clean professional interface with vector SVG icons and zero emojis.

### 7. Storage & Data Management
- Utilizes `chrome.storage.local` with zero remote servers or telemetry.
- Real-time local quota usage indicator.
- Full backup export (`.json`) and restore capability.

---

## Project Structure

```
SmartCopyPaste-Pro/
├── manifest.json                  # Manifest V3 extension configuration
├── README.md                      # Documentation
├── create-icons.py                # Pure Python PNG icon generator
├── background/
│   └── service-worker.js          # Background service worker (state, message router, context menus)
├── content/
│   ├── content-main.js            # Content script (DOM scanning, field detection, typing engine)
│   └── content-styles.css         # Injected CSS for target field highlights & overlay toasts
├── popup/
│   ├── popup.html                 # Main popup UI (8 modules)
│   ├── popup.css                  # Modern dark & light theme styling
│   └── popup.js                   # Popup frontend controller
├── options/
│   ├── options.html               # Options & settings page
│   ├── options.css                # Options page styling
│   └── options.js                 # Options page controller
├── icons/
│   ├── icon16.png                 # 16x16 icon
│   ├── icon32.png                 # 32x32 icon
│   ├── icon48.png                 # 48x48 icon
│   └── icon128.png                # 128x128 icon
└── tests/
    └── test-suite.js              # Automated Node.js test suite
```

---

## Installation & Setup

1. Open **Google Chrome** (or any Chromium browser).
2. Navigate to `chrome://extensions/` in the URL bar.
3. Turn on **Developer mode** toggle in the top-right corner.
4. Click **Load unpacked** in the top-left corner.
5. Select this project directory (`SmartCopyPaste-Pro`).
6. Pin **SmartPaste Pro** to your Chrome toolbar.

---

## Automated Tests

Run the included automated test suite anytime using Node.js:

```bash
node tests/test-suite.js
```
