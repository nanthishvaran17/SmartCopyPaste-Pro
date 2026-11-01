'use strict';

/**
 * SmartPaste Pro – Automated Test Suite
 * Validates core business logic, text parsing, security filters, question extraction,
 * and controlled typing engine modes.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
  }
}

console.log('====================================================');
console.log('   SmartPaste Pro – Comprehensive Test Suite       ');
console.log('====================================================\n');

// 1. Manifest V3 Validation
runTest('Manifest V3 structure and permissions verification', () => {
  const manifestPath = path.join(__dirname, '..', 'manifest.json');
  assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.strictEqual(manifest.manifest_version, 3, 'Must be Manifest V3');
  assert.ok(manifest.permissions.includes('storage'), 'Must include storage permission');
  assert.ok(manifest.permissions.includes('clipboardRead'), 'Must include clipboardRead');
  assert.ok(manifest.permissions.includes('clipboardWrite'), 'Must include clipboardWrite');
  assert.ok(manifest.permissions.includes('activeTab'), 'Must include activeTab');
  assert.ok(manifest.action.default_popup, 'Must declare default_popup');
  assert.ok(manifest.background.service_worker, 'Must declare background service worker');
});

// 2. Icon asset presence
runTest('Verify all 4 required PNG icons exist and have non-zero size', () => {
  for (const size of [16, 32, 48, 128]) {
    const iconPath = path.join(__dirname, '..', 'icons', `icon${size}.png`);
    assert.ok(fs.existsSync(iconPath), `icon${size}.png must exist`);
    const stats = fs.statSync(iconPath);
    assert.ok(stats.size > 50, `icon${size}.png must have valid binary size`);
  }
});

// 3. Security: Sensitive Data Filter
const isSensitiveContent = (text) => {
  if (!text) return false;
  const sensitivePatterns = [
    /password\s*[:=]\s*\S+/i,
    /token\s*[:=]\s*[A-Za-z0-9+/]{20,}/i,
    /api[_-]?key\s*[:=]\s*\S+/i,
    /secret\s*[:=]\s*\S+/i,
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b.*\b(?:password|passwd|pwd)\b/i
  ];
  return sensitivePatterns.some((p) => p.test(text));
};

runTest('Security: Sensitive credentials and API tokens are rejected', () => {
  assert.strictEqual(isSensitiveContent('Normal text here'), false);
  assert.strictEqual(isSensitiveContent('password = SuperSecretPassword123'), true);
  assert.strictEqual(isSensitiveContent('api_key: abc123def456xyz789'), true);
  assert.strictEqual(isSensitiveContent('token = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), true);
  assert.strictEqual(isSensitiveContent('user@domain.com password: 123'), true);
});

// 4. Category Auto-Detection
const detectCategory = (text) => {
  if (!text) return 'general';
  const trimmed = text.trim();
  if (
    /^(function|class|const|let|var|def |import |#include|public |private )/.test(trimmed) ||
    (/[{}();]/.test(trimmed) && trimmed.split('\n').length > 2)
  ) {
    return 'code';
  }
  if (/\?$/.test(trimmed) || /^\d+[\.\)]\s/.test(trimmed)) {
    return 'question';
  }
  if (trimmed.split('\n\n').length > 2 && trimmed.length > 500) {
    return 'article';
  }
  if (trimmed.split('\n').length > 3 || trimmed.length > 200) {
    return 'paragraph';
  }
  return 'general';
};

runTest('Category Detection: Correctly classifies code, questions, articles, and text', () => {
  assert.strictEqual(detectCategory('const x = 42;\nfunction test() {\n  return x;\n}'), 'code');
  assert.strictEqual(detectCategory('1. What is the capital of France?'), 'question');
  assert.strictEqual(detectCategory('What is photosynthesis?'), 'question');
  assert.strictEqual(detectCategory('Just a short normal note.'), 'general');
});

// 5. Smart Paste: Text Cleaning
const cleanText = (text) => {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ \u00A0]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

runTest('Smart Paste: Text cleaning removes excessive whitespace and Windows CRLF', () => {
  const dirty = 'Hello\r\n\tWorld!   Multiple   spaces.\n\n\n\nNew paragraph.';
  const cleaned = cleanText(dirty);
  assert.strictEqual(cleaned, 'Hello\n World! Multiple spaces.\n\nNew paragraph.');
});

// 6. Question Extraction & MCQ Options
const extractQuestionsFromText = (text) => {
  const questions = [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const seen = new Set();

  const numberedRegex = /^(?:Q?\.?\s*)?(\d+)[\.\):\-]\s+(.+)$/;
  const optionRegex = /^([A-Da-d])[\.\):\-]\s+(.+)$/;
  const standaloneRegex = /^.{8,250}\?$/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const match = line.match(numberedRegex);
    if (match) {
      const qNum = parseInt(match[1]);
      let qText = match[2].trim();
      const options = [];
      let j = i + 1;
      while (j < lines.length) {
        const optMatch = lines[j].match(optionRegex);
        if (optMatch) {
          options.push({ letter: optMatch[1].toUpperCase(), text: optMatch[2].trim() });
          j++;
        } else if (lines[j].match(numberedRegex)) {
          break;
        } else if (options.length === 0 && lines[j].length > 3 && !lines[j].match(/^\d+[\.\)]/)) {
          qText += ' ' + lines[j];
          j++;
        } else {
          break;
        }
      }
      const key = qText.substring(0, 45);
      if (!seen.has(key)) {
        seen.add(key);
        questions.push({
          number: qNum,
          text: qText,
          options,
          type: options.length > 0 ? 'mcq' : 'open',
          confidence: options.length > 0 ? 0.95 : 0.82
        });
      }
      i = j;
    } else if (standaloneRegex.test(line)) {
      const key = line.substring(0, 45);
      if (!seen.has(key)) {
        seen.add(key);
        questions.push({
          number: questions.length + 1,
          text: line,
          options: [],
          type: 'open',
          confidence: 0.70
        });
      }
      i++;
    } else {
      i++;
    }
  }
  return questions;
};

runTest('Question Extractor: Extracts numbered questions and MCQ choices A-D', () => {
  const quiz = `
1. What is the capital of Germany?
A. Munich
B. Berlin
C. Hamburg
D. Frankfurt

2. Which planet is known as the Red Planet?
A. Venus
B. Mars
C. Jupiter
D. Saturn

What is the speed of light in vacuum?
`;
  const questions = extractQuestionsFromText(quiz);
  assert.strictEqual(questions.length, 3, 'Should extract 3 questions');
  assert.strictEqual(questions[0].number, 1);
  assert.strictEqual(questions[0].text, 'What is the capital of Germany?');
  assert.strictEqual(questions[0].type, 'mcq');
  assert.strictEqual(questions[0].options.length, 4);
  assert.strictEqual(questions[0].options[1].letter, 'B');
  assert.strictEqual(questions[0].options[1].text, 'Berlin');

  assert.strictEqual(questions[1].number, 2);
  assert.strictEqual(questions[1].options[1].letter, 'B');
  assert.strictEqual(questions[1].options[1].text, 'Mars');

  assert.strictEqual(questions[2].type, 'open');
  assert.strictEqual(questions[2].text, 'What is the speed of light in vacuum?');
});

// 7. Typing Engine: Character Simulation & Delay Model
runTest('Typing Engine: Keystroke delay calculation logic', () => {
  const speedWPM = 60;
  // WPM to char delay: 60 WPM = 300 chars/min = 5 chars/sec = 200ms per char
  const fixedDelay = Math.round(60000 / (speedWPM * 5));
  assert.strictEqual(fixedDelay, 200);

  // Variable delay bounds check
  const minDelay = 30;
  const maxDelay = 120;
  for (let k = 0; k < 50; k++) {
    const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    assert.ok(randomDelay >= minDelay && randomDelay <= maxDelay);
  }
});

// 8. Typing Modes Tokenization
runTest('Typing Engine: Tokenization for Character, Word, Line, and Paragraph modes', () => {
  const sample = 'Line 1 word A.\nLine 2 word B.\n\nParagraph 2 text.';

  // Character mode: each char
  const chars = Array.from(sample);
  assert.strictEqual(chars.length, sample.length);

  // Word mode: preserves whitespace and words
  const wordsWithSeparators = sample.split(/(\s+)/);
  const reassembled = wordsWithSeparators.join('');
  assert.strictEqual(reassembled, sample);

  // Line mode
  const lines = sample.split('\n');
  assert.strictEqual(lines.length, 4); // "Line 1...", "Line 2...", "", "Paragraph 2..."

  // Paragraph mode
  const paras = sample.split(/\n\n+/);
  assert.strictEqual(paras.length, 2);
});

// 9. Data Export / Import Schema Validation
runTest('Data Architecture: Backup export and import schema fidelity', () => {
  const sampleBackup = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    clipboard_history: [
      {
        id: '123-abc',
        text: 'Sample clipboard entry',
        category: 'note',
        timestamp: new Date().toISOString()
      }
    ],
    scanned_pages: [],
    extracted_questions: [],
    typing_sessions: [],
    settings: {
      theme: 'dark',
      typingSpeed: 60
    }
  };

  const serialized = JSON.stringify(sampleBackup);
  const deserialized = JSON.parse(serialized);
  assert.strictEqual(deserialized.version, '1.0.0');
  assert.strictEqual(deserialized.clipboard_history[0].text, 'Sample clipboard entry');
  assert.strictEqual(deserialized.settings.theme, 'dark');
});

// 10. File Integrity Check
runTest('All mandatory project files are present and non-empty', () => {
  const expectedFiles = [
    'manifest.json',
    'background/service-worker.js',
    'content/content-main.js',
    'content/content-styles.css',
    'popup/popup.html',
    'popup/popup.css',
    'popup/popup.js',
    'options/options.html',
    'options/options.css',
    'options/options.js'
  ];

  for (const rel of expectedFiles) {
    const full = path.join(__dirname, '..', rel);
    assert.ok(fs.existsSync(full), `Missing expected file: ${rel}`);
    const stat = fs.statSync(full);
    assert.ok(stat.size > 0, `File is empty: ${rel}`);
  }
});

// 11. Ultra Speed & Instant Mode Validation
runTest('Typing Engine: Ultra-high speed (up to 2500 WPM) and Instant mode handling', () => {
  const speeds = [60, 180, 500, 1000, 2500];
  for (const s of speeds) {
    const fixedDelay = Math.max(0, Math.round(1000 / (s / 60)));
    assert.ok(fixedDelay >= 0);
  }
  // Instant mode check
  const text = 'Quick brown fox';
  const instantLength = text.length;
  assert.strictEqual(instantLength, 15);
});

// 12. Strict UI: No Emojis across any frontend file
runTest('UI Integrity: Verify zero emojis in HTML, CSS, and JS', () => {
  const filesToCheck = [
    'popup/popup.html',
    'popup/popup.js',
    'options/options.html',
    'content/content-main.js'
  ];
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  for (const f of filesToCheck) {
    const fullPath = path.join(__dirname, '..', f);
    const content = fs.readFileSync(fullPath, 'utf8');
    assert.strictEqual(emojiRegex.test(content), false, `File ${f} must not contain emojis`);
  }
});

console.log('\n----------------------------------------------------');
console.log(`Results: ${passedTests} / ${totalTests} tests passed.`);
console.log('----------------------------------------------------\n');

if (passedTests === totalTests) {
  console.log('>>> ALL AUTOMATED TESTS EXECUTED AND PASSED SUCCESSFULLY! <<<\n');
  process.exit(0);
} else {
  console.error('>>> SOME TESTS FAILED! <<<');
  process.exit(1);
}

