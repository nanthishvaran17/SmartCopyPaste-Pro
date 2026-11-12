'use strict';

(() => {
  if (window.__smartPasteLoaded) return;
  window.__smartPasteLoaded = true;

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  typingActive: false,
  typingPaused: false,
  typingAborted: false,
  currentTimeout: null,
  targetField: null,
  selectedTarget: null,
  typingText: '',
  typingMode: 'character',
  charsTyped: 0,
  wordsTyped: 0,
  startTime: null
};

// ─── Message Listener ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleContentMessage(message).then(sendResponse).catch(err => {
    sendResponse({ success: false, error: err.message });
  });
  return true;
});

async function handleContentMessage(message) {
  switch (message.action) {
    case 'scanPage':
      return scanPage();
    case 'extractQuestions':
      return extractQuestions();
    case 'detectInputFields':
      return detectInputFields();
    case 'startTyping':
      return startTyping(message.config);
    case 'pauseTyping':
      return pauseTyping();
    case 'resumeTyping':
      return resumeTyping();
    case 'stopTyping':
      return stopTyping();
    case 'getTypingStatus':
      return {
        success: true,
        typingActive: state.typingActive,
        typingPaused: state.typingPaused,
        charsTyped: state.charsTyped,
        total: state.typingText ? state.typingText.length : 0,
        text: state.typingText || ''
      };
    case 'startTargetPicker':
      return startTargetPicker();
    case 'getSelectedText':
      return { success: true, text: window.getSelection().toString() };
    case 'highlightField':
      return highlightField(message.fieldIndex);
    case 'ping':
      return { success: true, ready: true };
    default:
      return { success: false, error: `Unknown action: ${message.action}` };
  }
}

// ─── Page Scanner ─────────────────────────────────────────────────────────────
function scanPage() {
  try {
    const result = {
      title: document.title,
      url: window.location.href,
      domain: window.location.hostname,
      headings: extractHeadings(),
      paragraphs: extractParagraphs(),
      questions: extractQuestionsFromDOM(),
      codeBlocks: extractCodeBlocks(),
      lists: extractLists(),
      mainContent: extractMainContent(),
      wordCount: 0,
      charCount: 0,
      scanTime: new Date().toISOString()
    };
    
    result.wordCount = result.mainContent.split(/\s+/).filter(Boolean).length;
    result.charCount = result.mainContent.length;
    
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function extractHeadings() {
  const headings = [];
  const elements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  elements.forEach(el => {
    const text = el.innerText.trim();
    if (text && !isNavElement(el)) {
      headings.push({
        level: parseInt(el.tagName[1]),
        text,
        id: el.id || ''
      });
    }
  });
  return headings;
}

function extractParagraphs() {
  const paragraphs = [];
  const seen = new Set();
  const elements = document.querySelectorAll('p, article p, main p, .content p, .post-content p');
  elements.forEach(el => {
    const text = el.innerText.trim();
    if (text.length > 30 && !seen.has(text) && !isNavElement(el)) {
      seen.add(text);
      paragraphs.push(text);
    }
  });
  return paragraphs;
}

function extractMainContent() {
  // Try semantic elements first
  const selectors = ['main', 'article', '[role="main"]', '.main-content', '.content', '.post-content', '.article-content', '#content'];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = el.innerText.trim();
      if (text.length > 200) return text;
    }
  }
  // Fallback: body text minus nav/footer
  const clone = document.body.cloneNode(true);
  ['nav', 'footer', 'header', 'aside', 'script', 'style', '.nav', '.navigation', '.footer', '.header', '.sidebar', '.advertisement', '.ad'].forEach(sel => {
    clone.querySelectorAll(sel).forEach(el => el.remove());
  });
  return clone.innerText.trim().substring(0, 50000); // Cap at 50k chars
}

function extractCodeBlocks() {
  const blocks = [];
  const seen = new Set();
  document.querySelectorAll('pre, code, pre code, .code-block, .highlight').forEach(el => {
    const text = el.innerText.trim();
    if (text.length > 10 && !seen.has(text)) {
      seen.add(text);
      blocks.push({
        language: el.className.match(/language-(\w+)/)?.[1] || '',
        code: text
      });
    }
  });
  return blocks;
}

function extractLists() {
  const lists = [];
  document.querySelectorAll('ul, ol').forEach(el => {
    if (isNavElement(el)) return;
    const items = Array.from(el.querySelectorAll('li')).map(li => li.innerText.trim()).filter(t => t.length > 0);
    if (items.length > 1) lists.push(items);
  });
  return lists;
}

// ─── Question Extractor ───────────────────────────────────────────────────────
function extractQuestions() {
  try {
    const questions = extractQuestionsFromDOM();
    return { success: true, questions };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function extractQuestionsFromDOM() {
  const questions = [];
  const seen = new Set();
  
  // Strategy 1: Numbered questions (1. Question text, 1) Question text, Q1. etc.)
  const fullText = extractMainContent();
  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
  
  const numberedQuestionRegex = /^(?:Q?\.?\s*)?(\d+)[\.\):\-]\s+(.+\??\s*)$/;
  const optionRegex = /^([A-Da-d])[\.\):\-]\s+(.+)$/;
  const standaloneQuestionRegex = /^.{10,200}\?$/;
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const numMatch = line.match(numberedQuestionRegex);
    
    if (numMatch) {
      const qNum = parseInt(numMatch[1]);
      let qText = numMatch[2].trim();
      const options = [];
      let j = i + 1;
      
      // Collect continuation lines and options
      while (j < lines.length) {
        const nextLine = lines[j];
        const optMatch = nextLine.match(optionRegex);
        if (optMatch) {
          options.push({ letter: optMatch[1].toUpperCase(), text: optMatch[2].trim() });
          j++;
        } else if (nextLine.match(numberedQuestionRegex)) {
          break;
        } else if (nextLine.length > 5 && options.length === 0 && !nextLine.match(/^\d+[\.\)]/)) {
          // Continuation of question text
          qText += ' ' + nextLine;
          j++;
        } else {
          break;
        }
      }
      
      const key = qText.substring(0, 50);
      if (!seen.has(key)) {
        seen.add(key);
        questions.push({
          number: qNum,
          text: qText,
          options,
          type: options.length > 0 ? 'mcq' : 'open',
          confidence: options.length > 0 ? 0.95 : 0.80,
          source: 'numbered'
        });
      }
      i = j;
    } else if (standaloneQuestionRegex.test(line) && !isNavigationText(line)) {
      const key = line.substring(0, 50);
      if (!seen.has(key)) {
        seen.add(key);
        questions.push({
          number: questions.length + 1,
          text: line,
          options: [],
          type: 'open',
          confidence: 0.65,
          source: 'standalone'
        });
      }
      i++;
    } else {
      i++;
    }
  }
  
  // Strategy 2: Structural HTML question containers
  const questionSelectors = [
    '.question', '.quiz-question', '[class*="question"]',
    '[data-question]', '.exam-question', '.test-question'
  ];
  
  questionSelectors.forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      if (isNavElement(el)) return;
      const text = el.innerText.trim();
      const key = text.substring(0, 50);
      if (!seen.has(key) && text.length > 10) {
        seen.add(key);
        const optionEls = el.querySelectorAll('li, .option, [class*="option"], [class*="choice"]');
        const options = Array.from(optionEls).map((opt, idx) => ({
          letter: String.fromCharCode(65 + idx),
          text: opt.innerText.trim()
        })).filter(o => o.text.length > 0);
        
        questions.push({
          number: questions.length + 1,
          text: text.split('\n')[0].trim(),
          options,
          type: options.length > 1 ? 'mcq' : 'open',
          confidence: 0.90,
          source: 'structural'
        });
      }
    });
  });
  
  return questions.sort((a, b) => a.number - b.number);
}

function isNavigationText(text) {
  const navKeywords = ['click here', 'read more', 'learn more', 'sign in', 'log in', 'subscribe', 'download', 'contact us'];
  const lower = text.toLowerCase();
  return navKeywords.some(k => lower.includes(k));
}

function isNavElement(el) {
  let node = el;
  while (node && node !== document.body) {
    const tag = node.tagName?.toLowerCase();
    const role = node.getAttribute?.('role');
    const cls = node.className?.toString().toLowerCase() || '';
    if (['nav', 'header', 'footer'].includes(tag) || 
        ['navigation', 'banner', 'contentinfo'].includes(role) ||
        cls.includes('nav') || cls.includes('menu') || cls.includes('footer') || cls.includes('header')) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

// ─── Universal Element Resolver (Monaco, CodeMirror, Ace, RichText, React, Shadow DOM) ──
function resolveEditableTarget(rawTarget) {
  let el = rawTarget;
  if (!el || el === document.body || el === document.documentElement) {
    el = document.activeElement;
  }
  if (!el || el === document.body || el === document.documentElement) {
    return null;
  }

  // 1. Monaco Editor (VS Code Web, HackerRank, LeetCode, CodeSignal, Replit)
  const monacoContainer = el.closest ? el.closest('.monaco-editor') : null;
  if (monacoContainer) {
    const inputArea = monacoContainer.querySelector('textarea.inputarea');
    if (inputArea) return inputArea;
  }

  // 2. CodeMirror 6 Editor
  const cm6Container = el.closest ? el.closest('.cm-editor') : null;
  if (cm6Container) {
    const cmContent = cm6Container.querySelector('.cm-content[contenteditable="true"]');
    if (cmContent) return cmContent;
  }

  // 3. CodeMirror 5 Editor
  const cm5Container = el.closest ? el.closest('.CodeMirror') : null;
  if (cm5Container) {
    const cmTa = cm5Container.querySelector('textarea');
    if (cmTa) return cmTa;
  }

  // 4. Ace Editor
  const aceContainer = el.closest ? el.closest('.ace_editor') : null;
  if (aceContainer) {
    const aceTa = aceContainer.querySelector('textarea.ace_text-input') || aceContainer.querySelector('textarea');
    if (aceTa) return aceTa;
  }

  // 5. Rich text editors: Quill, Summernote, Lexical, Slate, Draft.js, CKEditor
  const richParent = el.closest ? el.closest('.ql-editor, .note-editable, [contenteditable="true"], [data-lexical-editor="true"], [data-slate-editor="true"], [role="textbox"]') : null;
  if (richParent) return richParent;

  // 6. Direct input/textarea/contenteditable
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable || el.getAttribute('contenteditable') === 'true') {
    return el;
  }

  // 7. Check if element has child inputs
  if (el.querySelector) {
    const child = el.querySelector('textarea, input:not([type="hidden"]), [contenteditable="true"]');
    if (child) return child;
  }

  // 8. Shadow DOM check
  if (el.shadowRoot) {
    const shadowInput = el.shadowRoot.querySelector('textarea, input:not([type="hidden"]), [contenteditable="true"]');
    if (shadowInput) return shadowInput;
  }

  return el;
}

function getAllEditableElements() {
  const elements = [];

  // Monaco
  document.querySelectorAll('.monaco-editor').forEach(editor => {
    const ta = editor.querySelector('textarea.inputarea');
    if (ta && !elements.includes(ta)) elements.push(ta);
  });

  // CodeMirror 6
  document.querySelectorAll('.cm-editor .cm-content[contenteditable="true"]').forEach(cm => {
    if (!elements.includes(cm)) elements.push(cm);
  });

  // CodeMirror 5
  document.querySelectorAll('.CodeMirror').forEach(cm => {
    const ta = cm.querySelector('textarea');
    if (ta && !elements.includes(ta)) elements.push(ta);
  });

  // Ace
  document.querySelectorAll('.ace_editor').forEach(ace => {
    const ta = ace.querySelector('textarea.ace_text-input') || ace.querySelector('textarea');
    if (ta && !elements.includes(ta)) elements.push(ta);
  });

  // Standard inputs, textareas, contenteditable
  document.querySelectorAll('input:not([type="hidden"]):not([type="password"]):not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"]').forEach(el => {
    if (el.disabled || el.readOnly) return;
    if (!elements.includes(el)) elements.push(el);
  });

  return elements;
}

// ─── Input Field Detector ─────────────────────────────────────────────────────
function detectInputFields() {
  const elements = getAllEditableElements();
  const fields = [];

  elements.forEach((el, idx) => {
    const rect = el.getBoundingClientRect();
    const displayRect = (rect.width <= 1 || rect.height <= 1) && el.parentElement 
      ? el.parentElement.getBoundingClientRect() 
      : rect;

    let tag = el.tagName.toLowerCase();
    let typeName = el.type || 'text';
    let placeholder = el.placeholder || el.getAttribute('aria-label') || '';

    if (el.closest && el.closest('.monaco-editor')) {
      tag = 'monaco';
      typeName = 'Monaco Code Editor';
      placeholder = placeholder || 'VS Code / HackerRank / LeetCode Editor';
    } else if (el.closest && el.closest('.cm-editor, .CodeMirror')) {
      tag = 'codemirror';
      typeName = 'CodeMirror Editor';
      placeholder = placeholder || 'CodeMirror Code Editor';
    } else if (el.closest && el.closest('.ace_editor')) {
      tag = 'ace';
      typeName = 'Ace Editor';
      placeholder = placeholder || 'Ace Code Editor';
    } else if (el.isContentEditable || el.contentEditable === 'true') {
      tag = 'rich-text';
      typeName = 'ContentEditable / Rich Text';
    }

    fields.push({
      index: idx,
      tag,
      type: typeName,
      placeholder,
      id: el.id || '',
      name: el.name || '',
      isContentEditable: el.isContentEditable || el.contentEditable === 'true',
      rect: {
        top: Math.round(displayRect.top),
        left: Math.round(displayRect.left),
        width: Math.round(displayRect.width || 300),
        height: Math.round(displayRect.height || 40)
      }
    });
  });

  return { success: true, fields };
}

// ─── Typing Engine ────────────────────────────────────────────────────────────
async function startTyping(config) {
  if (state.typingActive) {
    return { success: false, error: 'Typing is already in progress.' };
  }
  
  const { text, mode, speed, minDelay, maxDelay, fixedSpeed, targetIndex, pauseDuration } = config;
  
  if (!text || text.trim().length === 0) {
    return { success: false, error: 'No text to type.' };
  }
  
  // Target resolution priority:
  // 1. Explicitly chosen target via on-screen Target Picker (resolved)
  // 2. Currently active / focused element (resolved)
  // 3. User-specified targetIndex
  // 4. First detected interactive input field
  let target = resolveEditableTarget(state.selectedTarget);

  if (!target || !document.contains(target)) {
    const active = document.activeElement;
    if (active && active !== document.body && active !== document.documentElement) {
      target = resolveEditableTarget(active);
    }
  }

  if (!target && typeof targetIndex === 'number') {
    const all = getAllEditableElements();
    if (all[targetIndex]) {
      target = resolveEditableTarget(all[targetIndex]);
    }
  }

  if (!target) {
    const all = getAllEditableElements();
    if (all.length > 0) {
      target = resolveEditableTarget(all[0]);
    }
  }

  if (!target) {
    return { success: false, error: 'No eligible input field found on this page. Click "Pick Box on Page" or click inside your editor first!' };
  }
  
  state.typingActive = true;
  state.typingPaused = false;
  state.typingAborted = false;
  state.targetField = target;
  state.typingText = text;
  state.typingMode = mode || 'character';
  state.charsTyped = 0;
  state.wordsTyped = 0;
  state.startTime = Date.now();
  
  target.focus();
  
  // Calculate base delay from speed
  let baseDelay;
  if (fixedSpeed) {
    baseDelay = Math.max(0, Math.round(1000 / (speed / 60))); // chars per second
  } else {
    baseDelay = Math.max(0, Math.round(60000 / (speed * 5))); // WPM to ms per char
  }
  
  sendProgress({ status: 'started', total: text.length, typed: 0, mode });
  showFloatingTyper(text.length, 0);
  
  try {
    switch (state.typingMode) {
      case 'instant':
        await typeInstant(target, text);
        break;
      case 'character':
        await typeByCharacter(target, text, baseDelay, minDelay, maxDelay, fixedSpeed, speed);
        break;
      case 'word':
        await typeByWord(target, text, baseDelay, minDelay, maxDelay, fixedSpeed, speed);
        break;
      case 'line':
        await typeByLine(target, text, pauseDuration || 150);
        break;
      case 'paragraph':
        await typeByParagraph(target, text, pauseDuration || 250);
        break;
    }
  } catch (err) {
    // Aborted or errored
  }
  
  state.typingActive = false;
  
  if (!state.typingAborted) {
    sendProgress({ status: 'completed', total: text.length, typed: text.length });
  }
  
  return { success: true, completed: !state.typingAborted };
}

async function typeInstant(target, text) {
  if (state.typingAborted) return;
  insertText(target, text);
  state.charsTyped = text.length;
  state.wordsTyped = text.trim().split(/\s+/).filter(Boolean).length;
  sendProgress({ status: 'typing', total: text.length, typed: text.length });
  await sleep(10);
}

async function typeByCharacter(target, text, baseDelay, minDelay, maxDelay, fixedSpeed, speed = 0) {
  const isUltraFast = (fixedSpeed && baseDelay <= 2) || (maxDelay <= 2) || speed >= 2500;
  const burstSize = speed >= 12000 ? 6 : speed >= 8500 ? 4 : speed >= 6000 ? 3 : speed >= 4000 ? 2 : 1;
  
  for (let i = 0; i < text.length; i++) {
    if (state.typingAborted) break;
    while (state.typingPaused) {
      await sleep(100);
      if (state.typingAborted) return;
    }
    
    insertChar(target, text[i]);
    state.charsTyped++;
    
    if (text[i] === ' ') state.wordsTyped++;
    
    const delay = fixedSpeed ? baseDelay : randomDelay(Math.max(0, minDelay || 0), Math.max(0, maxDelay || 0));
    
    if (speed >= 4000) {
      if (i % burstSize === 0) {
        await sleep(burstSize <= 2 ? 3 : 2);
      }
    } else if (delay > 0) {
      await sleep(delay);
    } else if (isUltraFast && i % 15 === 0) {
      await sleep(0); // Yield to keep UI responsive
    }
    
    if (i % 20 === 0 || i === text.length - 1) {
      sendProgress({ status: 'typing', total: text.length, typed: i + 1 });
    }
  }
}

async function typeByWord(target, text, baseDelay, minDelay, maxDelay, fixedSpeed, speed = 0) {
  const words = text.split(/(\s+)/); // Keep separators
  const isUltraFast = (fixedSpeed && baseDelay <= 2) || (maxDelay <= 2) || speed >= 2500;
  const burstSize = speed >= 8500 ? 3 : speed >= 4000 ? 2 : 1;
  
  for (let i = 0; i < words.length; i++) {
    if (state.typingAborted) break;
    while (state.typingPaused) {
      await sleep(100);
      if (state.typingAborted) return;
    }
    
    const word = words[i];
    insertText(target, word);
    state.charsTyped += word.length;
    if (word.trim()) state.wordsTyped++;
    
    const delay = fixedSpeed ? 
      Math.max(0, Math.round(baseDelay * Math.min(word.length, 3))) : 
      randomDelay(
        Math.max(0, Math.round((minDelay || 0) * Math.max(1, word.length * 0.4))),
        Math.max(0, Math.round((maxDelay || 0) * Math.max(1, word.length * 0.7)))
      );
      
    if (speed >= 4000) {
      if (i % burstSize === 0) {
        await sleep(2);
      }
    } else if (delay > 0) {
      await sleep(delay);
    } else if (isUltraFast && i % 8 === 0) {
      await sleep(0);
    }
    
    sendProgress({ status: 'typing', total: text.length, typed: state.charsTyped });
  }
}

async function typeByLine(target, text, pauseDuration) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (state.typingAborted) break;
    while (state.typingPaused) {
      await sleep(100);
      if (state.typingAborted) return;
    }
    
    const line = lines[i] + (i < lines.length - 1 ? '\n' : '');
    insertText(target, line);
    state.charsTyped += line.length;
    
    await sleep(pauseDuration);
    sendProgress({ status: 'typing', total: text.length, typed: state.charsTyped });
  }
}

async function typeByParagraph(target, text, pauseDuration) {
  const paragraphs = text.split(/\n\n+/);
  for (let i = 0; i < paragraphs.length; i++) {
    if (state.typingAborted) break;
    while (state.typingPaused) {
      await sleep(100);
      if (state.typingAborted) return;
    }
    
    const para = paragraphs[i] + (i < paragraphs.length - 1 ? '\n\n' : '');
    insertText(target, para);
    state.charsTyped += para.length;
    
    await sleep(pauseDuration);
    sendProgress({ status: 'typing', total: text.length, typed: state.charsTyped });
  }
}

// ─── React Native Property Setter Bypass ──────────────────────────────────────
function setNativeInputValue(element, value) {
  try {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value') ||
                       Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value') ||
                       Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  } catch (e) {
    element.value = value;
  }
}

// ─── Simulated Realistic Key Events ───────────────────────────────────────────
function dispatchSimulatedKeyEvent(target, char, type) {
  try {
    const keyCode = char === '\n' ? 13 : (char === '\t' ? 9 : (char.charCodeAt(0) || 0));
    const key = char === '\n' ? 'Enter' : (char === '\t' ? 'Tab' : char);
    const code = char === '\n' ? 'Enter' : (char === '\t' ? 'Tab' : (char === ' ' ? 'Space' : `Key${char.toUpperCase()}`));
    const evt = new KeyboardEvent(type, {
      key,
      code,
      keyCode,
      which: keyCode,
      charCode: type === 'keypress' ? keyCode : 0,
      bubbles: true,
      cancelable: true,
      composed: true
    });
    target.dispatchEvent(evt);
  } catch (e) {}
}

// ─── Universal High-Compatibility Text Inserter ────────────────────────────────
function insertUniversalText(rawTarget, text, isSingleChar = false) {
  const target = resolveEditableTarget(rawTarget);
  if (!target) return false;

  try { target.focus(); } catch (e) {}

  // 1. CodeMirror 5 instance API
  const cmInstance = target.CodeMirror || (target.closest && target.closest('.CodeMirror')?.CodeMirror);
  if (cmInstance && typeof cmInstance.replaceSelection === 'function') {
    cmInstance.replaceSelection(text);
    return true;
  }

  // 2. Ace Editor instance API
  const aceEditor = (target.closest && target.closest('.ace_editor')?.env?.editor) || target.env?.editor;
  if (aceEditor && typeof aceEditor.insert === 'function') {
    aceEditor.insert(text);
    return true;
  }

  // 3. Dispatch simulated keydown & keypress for single keystroke emulation
  if (isSingleChar && text.length === 1) {
    dispatchSimulatedKeyEvent(target, text, 'keydown');
    dispatchSimulatedKeyEvent(target, text, 'keypress');
  }

  // 4. Strategy A: document.execCommand('insertText') (Monaco, Ace, CodeMirror 6, Google Docs)
  let execSuccess = false;
  try {
    execSuccess = document.execCommand('insertText', false, text);
  } catch (err) {}

  if (execSuccess) {
    if (isSingleChar && text.length === 1) {
      dispatchSimulatedKeyEvent(target, text, 'keyup');
    }
    return true;
  }

  // 5. Strategy B: ContentEditable Range Insertion
  const isContentEditable = target.isContentEditable || target.getAttribute('contenteditable') === 'true' || target.contentEditable === 'true';
  if (isContentEditable) {
    insertContentEditableRange(target, text);
    if (isSingleChar && text.length === 1) {
      dispatchSimulatedKeyEvent(target, text, 'keyup');
    }
    return true;
  }

  // 6. Strategy C: Standard Input / Textarea with React Setter Bypass
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || typeof target.value !== 'undefined') {
    try {
      const start = typeof target.selectionStart === 'number' ? target.selectionStart : (target.value ? target.value.length : 0);
      const end = typeof target.selectionEnd === 'number' ? target.selectionEnd : (target.value ? target.value.length : 0);
      const currentVal = target.value || '';
      const newVal = currentVal.substring(0, start) + text + currentVal.substring(end);

      setNativeInputValue(target, newVal);
      target.selectionStart = target.selectionEnd = start + text.length;

      try {
        const inputEvt = new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: text
        });
        target.dispatchEvent(inputEvt);
      } catch (e) {
        target.dispatchEvent(new Event('input', { bubbles: true }));
      }
      target.dispatchEvent(new Event('change', { bubbles: true }));

      if (isSingleChar && text.length === 1) {
        dispatchSimulatedKeyEvent(target, text, 'keyup');
      }
      return true;
    } catch (e) {}
  }

  // 7. Strategy D: Direct Append Fallback
  try {
    target.value = (target.value || '') + text;
    target.dispatchEvent(new Event('input', { bubbles: true }));
  } catch (e) {}

  if (isSingleChar && text.length === 1) {
    dispatchSimulatedKeyEvent(target, text, 'keyup');
  }
  return true;
}

function insertChar(target, char) {
  insertUniversalText(target, char, true);
}

function insertText(target, text) {
  insertUniversalText(target, text, false);
}

function insertContentEditableRange(target, text) {
  try {
    target.focus();
    let sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    const range = sel.getRangeAt(0);
    range.deleteContents();

    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > 0) {
        const textNode = document.createTextNode(lines[i]);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
      }
      if (i < lines.length - 1) {
        const br = document.createElement('br');
        range.insertNode(br);
        range.setStartAfter(br);
        range.setEndAfter(br);
      }
    }
    sel.removeAllRanges();
    sel.addRange(range);

    try {
      target.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: text
      }));
    } catch (e) {
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
    target.dispatchEvent(new Event('change', { bubbles: true }));
  } catch (err) {
    try {
      target.innerText = (target.innerText || '') + text;
      target.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (e) {}
  }
}

// ─── Target Picker ────────────────────────────────────────────────────────────
let hoveredPickerEl = null;

function startTargetPicker() {
  const existing = document.getElementById('smartpaste-picker-banner');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'smartpaste-picker-banner';
  toast.style.cssText = [
    'position: fixed',
    'top: 16px',
    'left: 50%',
    'transform: translateX(-50%)',
    'background: #0f172a',
    'color: #ffffff',
    'padding: 10px 18px',
    'border-radius: 10px',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    'font-size: 13px',
    'font-weight: 600',
    'box-shadow: 0 10px 30px rgba(0,0,0,0.5)',
    'z-index: 2147483647',
    'display: flex',
    'align-items: center',
    'gap: 12px',
    'border: 1px solid rgba(99, 102, 241, 0.6)'
  ].join(';');

  toast.innerHTML = '<span>Click any input box or code editor to select it. (ESC to cancel)</span><button id="smartpaste-picker-cancel" style="background: rgba(255,255,255,0.15); border: none; color: #fff; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 11px; font-weight: 700;">Cancel</button>';
  document.body.appendChild(toast);

  function onMouseOver(e) {
    if (toast.contains(e.target)) return;
    if (hoveredPickerEl && hoveredPickerEl !== e.target) {
      hoveredPickerEl.style.outline = '';
    }
    hoveredPickerEl = e.target;
    hoveredPickerEl.style.outline = '3px solid #6366f1';
  }

  function onMouseOut(e) {
    if (e.target && e.target.style) {
      e.target.style.outline = '';
    }
  }

  function onClick(e) {
    if (toast.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();

    const resolved = resolveEditableTarget(e.target);
    state.selectedTarget = resolved || e.target;
    if (hoveredPickerEl) hoveredPickerEl.style.outline = '3px solid #10b981';

    toast.style.background = '#065f46';
    toast.style.borderColor = '#10b981';
    toast.innerHTML = '<span>Target Selected! Return to SmartPaste Pro to type.</span>';

    setTimeout(() => {
      cleanup();
    }, 1400);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      cleanup();
    }
  }

  function cleanup() {
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('mouseout', onMouseOut, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    if (hoveredPickerEl) {
      hoveredPickerEl.style.outline = '';
      hoveredPickerEl = null;
    }
    const b = document.getElementById('smartpaste-picker-banner');
    if (b) b.remove();
  }

  document.getElementById('smartpaste-picker-cancel')?.addEventListener('click', cleanup);
  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', onMouseOut, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);

  return { success: true, message: 'Target picker active' };
}

function pauseTyping() {
  if (!state.typingActive) return { success: false, error: 'No active typing session.' };
  state.typingPaused = true;
  sendProgress({ status: 'paused', typed: state.charsTyped });
  return { success: true };
}

function resumeTyping() {
  if (!state.typingActive) return { success: false, error: 'No active typing session.' };
  state.typingPaused = false;
  sendProgress({ status: 'resumed', typed: state.charsTyped });
  return { success: true };
}

function stopTyping() {
  state.typingAborted = true;
  state.typingPaused = false;
  state.typingActive = false;
  removeFloatingTyper('Stopped!');
  sendProgress({
    status: 'stopped',
    typed: state.charsTyped,
    total: state.typingText ? state.typingText.length : 0
  });
  return { success: true };
}

function highlightField(fieldIndex) {
  const inputs = document.querySelectorAll(
    'input[type="text"], input[type="search"], input[type="email"], input:not([type]), textarea, [contenteditable="true"], [contenteditable=""]'
  );
  if (inputs[fieldIndex]) {
    inputs[fieldIndex].style.outline = '3px solid #6c63ff';
    inputs[fieldIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
      if (inputs[fieldIndex]) inputs[fieldIndex].style.outline = '';
    }, 3000);
    return { success: true };
  }
  return { success: false, error: 'Field not found' };
}

function sendProgress(data) {
  if (data.status === 'started' || data.status === 'typing') {
    updateFloatingTyper(data.total, data.typed || 0);
  } else if (data.status === 'completed') {
    removeFloatingTyper('Finished!');
  } else if (data.status === 'stopped') {
    removeFloatingTyper('Stopped!');
  }
  chrome.runtime.sendMessage({ action: 'typingProgress', ...data }).catch(() => {});
}

// ─── Floating On-Screen Typer Badge ───────────────────────────────────────────
function showFloatingTyper(total, typed = 0) {
  let badge = document.getElementById('smartpaste-floating-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'smartpaste-floating-badge';
    badge.style.cssText = [
      'position: fixed',
      'top: 18px',
      'right: 24px',
      'background: #090d16',
      'color: #ffffff',
      'padding: 8px 14px',
      'border-radius: 12px',
      'border: 1px solid rgba(99, 102, 241, 0.6)',
      'box-shadow: 0 10px 30px rgba(0,0,0,0.6), 0 0 15px rgba(99,102,241,0.3)',
      'z-index: 2147483647',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      'font-size: 12px',
      'font-weight: 600',
      'display: flex',
      'align-items: center',
      'gap: 10px',
      'pointer-events: auto'
    ].join(';');

    badge.innerHTML = '<div style="display:flex;align-items:center;gap:6px;"><span style="width:8px;height:8px;border-radius:50%;background:#10b981;box-shadow:0 0 8px #10b981;"></span><span id="smartpaste-badge-text">Auto-Typing: 0%</span></div><button id="smartpaste-badge-stop" style="background:#ef4444;color:#ffffff;border:none;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:800;cursor:pointer;letter-spacing:0.3px;box-shadow:0 2px 8px rgba(239,68,68,0.4);">STOP (ESC)</button>';

    document.body.appendChild(badge);

    const stopBtn = badge.querySelector('#smartpaste-badge-stop');
    if (stopBtn) {
      stopBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        stopTyping();
      });
    }
  }

  const percent = total > 0 ? Math.min(100, Math.round((typed / total) * 100)) : 0;
  const textEl = badge.querySelector('#smartpaste-badge-text');
  if (textEl) {
    textEl.textContent = `Auto-Typing: ${percent}% (${typed}/${total})`;
  }
}

function updateFloatingTyper(total, typed) {
  const badge = document.getElementById('smartpaste-floating-badge');
  if (!badge) {
    showFloatingTyper(total, typed);
    return;
  }
  const percent = total > 0 ? Math.min(100, Math.round((typed / total) * 100)) : 0;
  const textEl = badge.querySelector('#smartpaste-badge-text');
  if (textEl) {
    textEl.textContent = `Auto-Typing: ${percent}% (${typed}/${total})`;
  }
}

function removeFloatingTyper(message = null) {
  const badge = document.getElementById('smartpaste-floating-badge');
  if (!badge) return;
  if (message) {
    const textEl = badge.querySelector('#smartpaste-badge-text');
    if (textEl) textEl.textContent = message;
    const stopBtn = badge.querySelector('#smartpaste-badge-stop');
    if (stopBtn) stopBtn.style.display = 'none';
    setTimeout(() => {
      const b = document.getElementById('smartpaste-floating-badge');
      if (b) b.remove();
    }, 900);
  } else {
    badge.remove();
  }
}

// Global escape key listener to stop typing immediately
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.typingActive) {
    e.preventDefault();
    stopTyping();
  }
}, true);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Exam Stealth Shield: Anti-Blur & Anti-Tab-Switch Detection ──────────────
function initStealthExamShield() {
  try {
    // 1. Neutralize visibilityState and hidden property traps used by proctored tests
    Object.defineProperty(document, 'visibilityState', {
      get: () => 'visible',
      configurable: true
    });
    Object.defineProperty(document, 'hidden', {
      get: () => false,
      configurable: true
    });

    // 2. Prevent synthetic visibilitychange events from notifying the test page
    window.addEventListener('visibilitychange', (e) => {
      if (document.visibilityState === 'visible') {
        e.stopImmediatePropagation();
      }
    }, true);

    // 3. Prevent blur event if interaction is happening within our stealth HUD
    window.addEventListener('blur', (e) => {
      const stealthHost = document.getElementById('smartpaste-stealth-host');
      if (stealthHost && stealthHost.contains(document.activeElement)) {
        e.stopImmediatePropagation();
      }
    }, true);

    // 4. Universal Anti-Paste & Anti-Copy Unblocker (Bypasses paste/copy/right-click blocks on exam sites)
    const unblockEvents = ['paste', 'copy', 'cut', 'contextmenu', 'selectstart', 'dragstart', 'drop'];
    unblockEvents.forEach(evtName => {
      window.addEventListener(evtName, (e) => {
        // Prevent anti-cheat scripts from stopping copy/paste events
        e.stopImmediatePropagation = () => {};
      }, true);
    });

    // Remove inline event blockers on all inputs and body
    const removeInlineBlockers = () => {
      try {
        document.querySelectorAll('*[onpaste], *[oncopy], *[oncut], *[oncontextmenu], *[ondrop], *[onselectstart]').forEach(el => {
          el.onpaste = null;
          el.oncopy = null;
          el.oncut = null;
          el.oncontextmenu = null;
          el.ondrop = null;
          el.onselectstart = null;
        });
      } catch (e) {}
    };
    removeInlineBlockers();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', removeInlineBlockers);
    }
  } catch (err) {
    // Context or permission restricted, continue gracefully
  }
}
initStealthExamShield();

// ─── In-Page Fullscreen Stealth HUD ──────────────────────────────────────────
let stealthHost = null;
let stealthShadow = null;
let stealthSelectedSpeed = 15000;
let stealthLastSolution = '';
let lastUserFocusedTarget = null;

function detectExamLanguage() {
  try {
    const langSelect = document.querySelector('select[id*="lang" i], select[name*="lang" i], select[class*="lang" i]');
    if (langSelect) {
      const selectedOption = langSelect.options[langSelect.selectedIndex];
      if (selectedOption && selectedOption.text) return selectedOption.text.trim();
      if (langSelect.value) return langSelect.value.trim();
    }
    const elements = Array.from(document.querySelectorAll('span, div, label, p, button')).filter(el => {
      if (stealthHost && stealthHost.contains(el)) return false;
      const t = el.innerText ? el.innerText.trim() : '';
      return t.toLowerCase().startsWith('language') && t.length < 35;
    });
    if (elements.length > 0) {
      const parts = elements[0].innerText.split(/[:\n]/);
      if (parts.length > 1 && parts[parts.length - 1].trim()) {
        return parts[parts.length - 1].trim();
      }
    }
  } catch (e) {}
  return '';
}

function getCleanPageSelection() {
  try {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return '';
    const text = sel.toString().trim();
    if (!text) return '';
    const anchor = sel.anchorNode;
    if (anchor && stealthHost && (stealthHost.contains(anchor) || (stealthShadow && stealthShadow.contains(anchor)))) {
      return '';
    }
    return text;
  } catch (e) {
    return '';
  }
}

function grabExamQuestionFromPage() {
  const selText = getCleanPageSelection();
  if (selText && selText.length > 10) return selText;

  const selectors = [
    'div[class*="problem" i]',
    'div[class*="question" i]',
    'div[id*="problem" i]',
    'div[id*="question" i]',
    'div[class*="statement" i]',
    'div[class*="instruction" i]',
    'div[class*="desc" i]',
    'section[class*="problem" i]',
    'main[class*="problem" i]'
  ];

  for (const s of selectors) {
    const el = document.querySelector(s);
    if (el && !stealthHost.contains(el)) {
      const text = el.innerText ? el.innerText.trim() : '';
      if (text.length > 30 && (text.includes('Problem Statement') || text.includes('Constraints') || text.includes('Input Format') || text.includes('Output Format') || text.includes('Sample Input'))) {
        return text;
      }
    }
  }

  // Headings check: e.g. "Problem Statement"
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, b, div, p')).filter(el => {
    if (stealthHost && stealthHost.contains(el)) return false;
    const t = el.innerText ? el.innerText.trim() : '';
    return t.includes('Problem Statement') || t.includes('Answer The Following') || t.includes('JAVA_') || t.includes('C_');
  });

  if (headings.length > 0) {
    const container = headings[0].closest('div[class*="pane" i], div[class*="col" i], div[class*="left" i], div, section') || headings[0].parentElement;
    if (container && !stealthHost.contains(container)) {
      const full = container.innerText ? container.innerText.trim() : '';
      if (full.length > 40) return full;
    }
  }

  const scan = scanPage();
  if (scan && scan.success && scan.data && scan.data.mainContent) {
    return scan.data.mainContent;
  }

  return '';
}

function detectMainExamEditor() {
  // Check active cursor first
  if (document.activeElement && document.activeElement !== document.body && document.activeElement !== document.documentElement) {
    if (!stealthHost || !stealthHost.contains(document.activeElement)) {
      const resolved = resolveEditableTarget(document.activeElement);
      if (resolved) return { el: resolved, name: 'Active Cursor Editor' };
    }
  }

  // Check last focused target
  if (lastUserFocusedTarget && document.contains(lastUserFocusedTarget)) {
    return { el: lastUserFocusedTarget, name: 'Locked Cursor Editor' };
  }

  // 1. Monaco Editor
  const monaco = document.querySelector('.monaco-editor');
  if (monaco) {
    const ta = monaco.querySelector('textarea.inputarea') || monaco.querySelector('textarea');
    if (ta) return { el: ta, name: 'Monaco Code Editor' };
  }

  // 2. CodeMirror 6 Editor
  const cm6 = document.querySelector('.cm-editor .cm-content[contenteditable="true"]');
  if (cm6) return { el: cm6, name: 'CodeMirror Editor' };

  // 3. CodeMirror 5 Editor
  const cm5 = document.querySelector('.CodeMirror');
  if (cm5) {
    const ta = cm5.querySelector('textarea') || cm5.querySelector('.CodeMirror-code');
    if (ta) return { el: ta, name: 'CodeMirror Editor' };
  }

  // 4. Ace Editor
  const ace = document.querySelector('.ace_editor');
  if (ace) {
    const ta = ace.querySelector('textarea.ace_text-input') || ace.querySelector('textarea');
    if (ta) return { el: ta, name: 'Ace Code Editor' };
  }

  // 5. Look for containers with "code", "editor", "Enter your code"
  const candidates = Array.from(document.querySelectorAll('div, section, article, main')).filter(c => {
    if (stealthHost && stealthHost.contains(c)) return false;
    const txt = (c.getAttribute('aria-label') || c.className || c.id || '').toLowerCase();
    const inner = (c.innerText || '').slice(0, 100).toLowerCase();
    return txt.includes('code') || txt.includes('editor') || inner.includes('enter your code');
  });

  for (const c of candidates) {
    const innerTa = c.querySelector('textarea, [contenteditable="true"]');
    if (innerTa) {
      return { el: innerTa, name: 'Exam Code Box' };
    }
  }

  // 6. Look for ANY textarea on page, checking PARENT dimensions or element dimensions
  const allTextareas = Array.from(document.querySelectorAll('textarea')).filter(ta => {
    if (stealthHost && stealthHost.contains(ta)) return false;
    if (ta.disabled || ta.readOnly) return false;
    const rect = ta.getBoundingClientRect();
    const parentRect = ta.parentElement ? ta.parentElement.getBoundingClientRect() : { width: 0, height: 0 };
    return (rect.width > 20 && rect.height > 20) || (parentRect.width > 100 && parentRect.height > 80);
  });

  if (allTextareas.length > 0) {
    allTextareas.sort((a, b) => {
      const pa = a.parentElement ? a.parentElement.getBoundingClientRect() : a.getBoundingClientRect();
      const pb = b.parentElement ? b.parentElement.getBoundingClientRect() : b.getBoundingClientRect();
      return (pb.width * pb.height) - (pa.width * pa.height);
    });
    return { el: allTextareas[0], name: 'Exam Code Editor' };
  }

  // 7. Check iframes
  const iframes = document.querySelectorAll('iframe, frame');
  for (const iframe of iframes) {
    try {
      const iDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iDoc) {
        const sub = iDoc.querySelector('.monaco-editor textarea.inputarea, .cm-editor .cm-content, .CodeMirror textarea, .ace_editor textarea, textarea');
        if (sub) return { el: sub, name: 'Iframe Code Editor' };
      }
    } catch (e) {}
  }

  const input = document.querySelector('input[type="text"], input:not([type])');
  if (input) return { el: input, name: 'Input Field' };

  return null;
}

function executeDeepCodePaste(target, code) {
  if (!target) return false;
  try { target.focus(); } catch (e) {}

  let cleanCode = code.replace(/^```[a-zA-Z0-9_-]*\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();

  // 1. Ace Editor direct API
  try {
    const aceEditor = (target.closest && target.closest('.ace_editor')?.env?.editor) || 
                      (target.env?.editor) || 
                      (window.ace && typeof window.ace.edit === 'function' ? window.ace.edit(target.closest ? target.closest('.ace_editor') : target) : null);
    if (aceEditor && typeof aceEditor.setValue === 'function') {
      aceEditor.setValue(cleanCode, 1);
      return true;
    }
    if (aceEditor && typeof aceEditor.insert === 'function') {
      aceEditor.insert(cleanCode);
      return true;
    }
  } catch (e) {}

  // 2. CodeMirror direct API
  try {
    const cm = target.CodeMirror || (target.closest && target.closest('.CodeMirror')?.CodeMirror);
    if (cm && typeof cm.setValue === 'function') {
      cm.setValue(cleanCode);
      return true;
    }
    if (cm && typeof cm.replaceSelection === 'function') {
      cm.replaceSelection(cleanCode);
      return true;
    }
  } catch (e) {}

  // 3. Monaco direct API
  try {
    if (window.monaco && window.monaco.editor) {
      const models = window.monaco.editor.getModels();
      if (models && models.length > 0) {
        models[0].setValue(cleanCode);
        return true;
      }
    }
  } catch (e) {}

  // 4. Owner Document execCommand
  try {
    const doc = target.ownerDocument || document;
    if (target.select) target.select();
    if (doc.execCommand('selectAll', false, null)) {
      if (doc.execCommand('insertText', false, cleanCode)) {
        return true;
      }
    }
    if (doc.execCommand('insertText', false, cleanCode)) {
      return true;
    }
  } catch (e) {}

  // 5. Standard Textarea / Input with React Native Setter Bypass
  if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || typeof target.value !== 'undefined') {
    try {
      setNativeInputValue(target, cleanCode);
      try {
        const inputEvt = new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: cleanCode
        });
        target.dispatchEvent(inputEvt);
      } catch (e) {
        target.dispatchEvent(new Event('input', { bubbles: true }));
      }
      target.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch (e) {}
  }

  // 6. ContentEditable Range Replacement
  if (target.isContentEditable || target.getAttribute('contenteditable') === 'true') {
    try {
      insertContentEditableRange(target, cleanCode);
      return true;
    } catch (e) {}
  }

  return false;
}

function getTargetDisplayName(el) {
  if (!el) return 'No target selected';
  if (el.closest && el.closest('.monaco-editor')) return 'Monaco Code Editor';
  if (el.closest && el.closest('.cm-editor, .CodeMirror')) return 'CodeMirror Editor';
  if (el.closest && el.closest('.ace_editor')) return 'Ace Code Editor';
  if (el.tagName === 'TEXTAREA') {
    const idOrClass = el.id || el.className || el.name || '';
    if (idOrClass.toLowerCase().includes('code')) return 'Exam Code Area';
    return 'Code Textarea';
  }
  if (el.isContentEditable || el.contentEditable === 'true') return 'Rich Code Editor';
  if (el.tagName === 'INPUT') return 'Input Field';
  return 'Exam Box';
}

function updateHUDTargetStatus() {
  if (!stealthShadow) return;
  const nameEl = stealthShadow.getElementById('hudTargetName');
  const dotEl = stealthShadow.getElementById('hudTargetDot');
  if (!nameEl || !dotEl) return;

  if (lastUserFocusedTarget && document.contains(lastUserFocusedTarget)) {
    nameEl.textContent = `${getTargetDisplayName(lastUserFocusedTarget)} (Locked)`;
    nameEl.style.color = '#34d399';
    dotEl.style.background = '#10b981';
    dotEl.style.boxShadow = '0 0 6px rgba(16, 185, 129, 0.6)';
    return;
  }

  const detected = detectMainExamEditor();
  if (detected && detected.el) {
    nameEl.textContent = `${detected.name} (Auto-detected)`;
    nameEl.style.color = '#38bdf8';
    dotEl.style.background = '#38bdf8';
    dotEl.style.boxShadow = '0 0 6px rgba(56, 189, 248, 0.6)';
    return;
  }

  nameEl.textContent = 'Click "Pick Box" or click editor';
  nameEl.style.color = '#f59e0b';
  dotEl.style.background = '#f59e0b';
  dotEl.style.boxShadow = 'none';
}

// Track cursor focus and clicks across the web page
document.addEventListener('focusin', (e) => {
  if (stealthHost && stealthHost.contains(e.target)) return;
  const resolved = resolveEditableTarget(e.target);
  if (resolved) {
    lastUserFocusedTarget = resolved;
    updateHUDTargetStatus();
  }
}, true);

document.addEventListener('pointerdown', (e) => {
  if (stealthHost && stealthHost.contains(e.target)) return;
  const resolved = resolveEditableTarget(e.target);
  if (resolved) {
    lastUserFocusedTarget = resolved;
    updateHUDTargetStatus();
  }
}, true);

function createStealthHUD() {
  if (stealthHost) return;

  stealthHost = document.createElement('div');
  stealthHost.id = 'smartpaste-stealth-host';
  stealthHost.style.cssText = [
    'position: fixed',
    'top: 60px',
    'right: 28px',
    'z-index: 2147483647',
    'display: none',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  ].join(';');

  stealthShadow = stealthHost.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    .hud-window {
      width: 380px;
      background: #0b0f19;
      color: #e2e8f0;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 12px;
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.08);
      font-size: 12px;
      overflow: hidden;
      animation: hudFadeIn 0.15s ease-out;
    }
    @keyframes hudFadeIn {
      from { opacity: 0; transform: scale(0.97) translateY(-6px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    .hud-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px;
      background: #111827;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      cursor: grab;
      user-select: none;
    }
    .hud-header:active { cursor: grabbing; }
    .hud-title-wrap {
      display: flex;
      align-items: center;
      gap: 7px;
    }
    .hud-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
    }
    .hud-title {
      font-weight: 700;
      font-size: 12px;
      color: #f8fafc;
      letter-spacing: -0.2px;
    }
    .hud-shortcut-badge {
      font-size: 9.5px;
      padding: 2px 6px;
      background: rgba(255, 255, 255, 0.07);
      border-radius: 4px;
      color: #94a3b8;
    }
    .hud-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .hud-btn-mini {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #94a3b8;
      border-radius: 5px;
      padding: 3px 8px;
      font-size: 10px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.12s;
    }
    .hud-btn-mini:hover {
      background: rgba(255, 255, 255, 0.08);
      color: #f1f5f9;
      border-color: rgba(255, 255, 255, 0.2);
    }
    .hud-btn-panic {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.35);
      color: #f87171;
    }
    .hud-btn-panic:hover {
      background: #ef4444;
      color: #ffffff;
      border-color: #ef4444;
    }
    .hud-body {
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: 480px;
      overflow-y: auto;
    }
    .hud-row-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .hud-btn-secondary {
      flex: 1;
      padding: 7px 10px;
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 6px;
      color: #cbd5e1;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      transition: all 0.12s;
    }
    .hud-btn-secondary:hover {
      background: #334155;
      color: #ffffff;
    }
    .hud-btn-primary {
      flex: 1;
      padding: 7px 10px;
      background: #2563eb;
      border: 1px solid #1d4ed8;
      border-radius: 6px;
      color: #ffffff;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      transition: all 0.12s;
      box-shadow: 0 2px 6px rgba(37, 99, 235, 0.35);
    }
    .hud-btn-primary:hover {
      background: #1d4ed8;
    }
    .hud-btn-primary:disabled, .hud-btn-secondary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .hud-textarea {
      width: 100%;
      height: 70px;
      background: #070a12;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 6px;
      padding: 8px 10px;
      color: #f1f5f9;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      resize: vertical;
      outline: none;
    }
    .hud-textarea:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }
    .hud-solution-box {
      background: #070a12;
      border: 1px solid rgba(16, 185, 129, 0.25);
      border-radius: 6px;
      padding: 8px 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 11px;
      color: #34d399;
      max-height: 120px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
      display: none;
    }
    .hud-target-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 10px;
      background: #070a12;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 6px;
    }
    .hud-target-info {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow: hidden;
      flex: 1;
    }
    .hud-target-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
      flex-shrink: 0;
    }
    .hud-target-label {
      font-size: 10px;
      font-weight: 600;
      color: #94a3b8;
      flex-shrink: 0;
    }
    .hud-target-name {
      font-size: 10.5px;
      font-weight: 600;
      color: #34d399;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .hud-target-pick-btn {
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #93c5fd;
      border-radius: 4px;
      padding: 3px 8px;
      font-size: 9.5px;
      font-weight: 600;
      cursor: pointer;
      flex-shrink: 0;
      transition: all 0.12s;
    }
    .hud-target-pick-btn:hover {
      background: #2563eb;
      color: #ffffff;
      border-color: #3b82f6;
    }
    .hud-speeds-wrap {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }
    .hud-speed-label {
      font-size: 10px;
      font-weight: 600;
      color: #94a3b8;
      margin-right: 2px;
    }
    .hud-speed-pill {
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #94a3b8;
      border-radius: 4px;
      padding: 3px 6px;
      font-size: 9.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.12s;
    }
    .hud-speed-pill:hover {
      color: #ffffff;
      background: #334155;
    }
    .hud-speed-pill.active {
      background: #2563eb;
      color: #ffffff;
      border-color: #3b82f6;
    }
    .hud-action-buttons {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .hud-btn-instant-paste {
      background: #2563eb;
      border-color: #1d4ed8;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.35);
    }
    .hud-btn-instant-paste:hover {
      background: #1d4ed8;
    }
    .hud-type-btn {
      width: 100%;
      padding: 9px 12px;
      background: #10b981;
      border: 1px solid #059669;
      border-radius: 6px;
      color: #ffffff;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      text-align: center;
      transition: all 0.12s;
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
    }
    .hud-type-btn:hover {
      background: #059669;
    }
    .hud-type-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .hud-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      color: #64748b;
      padding-top: 4px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
    }
  `;

  const container = document.createElement('div');
  container.className = 'hud-window';
  container.innerHTML = `
    <div class="hud-header" id="hudHeader">
      <div class="hud-title-wrap">
        <div class="hud-dot"></div>
        <span class="hud-title" id="hudTitleText">SmartPaste Stealth</span>
        <span class="hud-shortcut-badge">Alt+S</span>
      </div>
      <div class="hud-actions">
        <button type="button" class="hud-btn-mini" id="hudCamouflageBtn" title="Camouflage title to look like dev console">Camo</button>
        <button type="button" class="hud-btn-mini hud-btn-panic" id="hudPanicBtn" title="Instant Panic Hide (Esc / Alt+H)">Hide (Esc)</button>
      </div>
    </div>
    <div class="hud-body">
      <div class="hud-row-top">
        <button type="button" class="hud-btn-secondary" id="hudGrabBtn">Grab Question</button>
        <button type="button" class="hud-btn-primary" id="hudSolveBtn">Solve with Gemini</button>
      </div>
      <textarea class="hud-textarea" id="hudPromptInput" placeholder="Paste or grab question from the exam page..."></textarea>
      <div class="hud-solution-box" id="hudSolutionBox"></div>
      <div class="hud-target-row">
        <div class="hud-target-info">
          <div class="hud-target-dot" id="hudTargetDot"></div>
          <span class="hud-target-label">Target:</span>
          <span class="hud-target-name" id="hudTargetName">Detecting cursor...</span>
        </div>
        <button type="button" class="hud-target-pick-btn" id="hudPickBoxBtn" title="Click to manually pick exam editor / cursor box">Pick Box</button>
      </div>
      <div class="hud-speeds-wrap">
        <span class="hud-speed-label">Speed:</span>
        <button type="button" class="hud-speed-pill active" data-speed="15000">15000 WPM</button>
        <button type="button" class="hud-speed-pill" data-speed="10000">10000</button>
        <button type="button" class="hud-speed-pill" data-speed="5000">5000</button>
        <button type="button" class="hud-speed-pill" data-speed="2500">2500</button>
        <button type="button" class="hud-speed-pill" data-speed="instant">Instant</button>
      </div>
      <div class="hud-action-buttons">
        <button type="button" class="hud-type-btn hud-btn-instant-paste" id="hudInstantPasteBtn">PASTE NOW (Instant)</button>
        <button type="button" class="hud-type-btn" id="hudStartTypeBtn">AUTO-TYPE (Stealth)</button>
      </div>
      <div class="hud-footer">
        <span>Exam Shield: Active (Tab-blur protected)</span>
        <span>Hide: Alt+H / Esc</span>
      </div>
    </div>
  `;

  stealthShadow.appendChild(style);
  stealthShadow.appendChild(container);
  document.documentElement.appendChild(stealthHost);

  // Setup draggable header
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  const header = stealthShadow.getElementById('hudHeader');

  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    isDragging = true;
    dragOffsetX = e.clientX - stealthHost.offsetLeft;
    dragOffsetY = e.clientY - stealthHost.offsetTop;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const newX = Math.max(10, Math.min(window.innerWidth - 390, e.clientX - dragOffsetX));
    const newY = Math.max(10, Math.min(window.innerHeight - 100, e.clientY - dragOffsetY));
    stealthHost.style.right = 'auto';
    stealthHost.style.left = `${newX}px`;
    stealthHost.style.top = `${newY}px`;
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Panic button
  stealthShadow.getElementById('hudPanicBtn')?.addEventListener('click', hideStealthHUD);

  // Camouflage title button
  let isCamo = false;
  stealthShadow.getElementById('hudCamouflageBtn')?.addEventListener('click', () => {
    isCamo = !isCamo;
    const title = stealthShadow.getElementById('hudTitleText');
    if (title) {
      title.textContent = isCamo ? 'Diagnostic Assistant' : 'SmartPaste Stealth';
    }
  });

  // Grab button
  stealthShadow.getElementById('hudGrabBtn')?.addEventListener('click', () => {
    const promptInput = stealthShadow.getElementById('hudPromptInput');
    const questionText = grabExamQuestionFromPage();
    if (questionText) {
      if (promptInput) {
        promptInput.value = questionText;
        promptInput.style.borderColor = '#10b981';
        setTimeout(() => { if (promptInput) promptInput.style.borderColor = ''; }, 1200);
      }
      return;
    }
    alert('Please highlight the question text on page first, then click Grab!');
  });

  // Solve with Gemini AI
  stealthShadow.getElementById('hudSolveBtn')?.addEventListener('click', async () => {
    const promptInput = stealthShadow.getElementById('hudPromptInput');
    const solveBtn = stealthShadow.getElementById('hudSolveBtn');
    const solutionBox = stealthShadow.getElementById('hudSolutionBox');
    const prompt = promptInput ? promptInput.value.trim() : '';

    if (!prompt) {
      alert('Please enter or grab a question first!');
      return;
    }

    if (solveBtn) {
      solveBtn.disabled = true;
      solveBtn.textContent = 'Solving...';
    }
    if (solutionBox) {
      solutionBox.style.display = 'block';
      solutionBox.textContent = 'Generating solution with Gemini AI...';
    }

    const detectedLang = detectExamLanguage();
    const langPrompt = detectedLang 
      ? `The exam platform is set to ${detectedLang}. You MUST write the complete solution strictly in ${detectedLang}.` 
      : 'Write the complete solution in clean, production-ready code.';

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'generateAI',
        provider: 'gemini',
        prompt: `${langPrompt}\nDo NOT include markdown fences, conversational chatter, or explanations. Output ONLY executable raw code ready to compile:\n\n${prompt}`
      });

      if (res && res.success && (res.reply || res.text)) {
        let clean = (res.reply || res.text).trim();
        clean = clean.replace(/^```[a-zA-Z0-9_-]*\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
        stealthLastSolution = clean;
        if (solutionBox) solutionBox.textContent = stealthLastSolution;
      } else {
        const err = res?.error || 'Failed to generate solution. Check Gemini API key in Settings.';
        if (solutionBox) solutionBox.textContent = 'Error: ' + err;
      }
    } catch (err) {
      if (solutionBox) solutionBox.textContent = 'Error: ' + err.message;
    } finally {
      if (solveBtn) {
        solveBtn.disabled = false;
        solveBtn.textContent = 'Solve with Gemini';
      }
    }
  });

  // Speed selector pills
  stealthShadow.querySelectorAll('.hud-speed-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      stealthShadow.querySelectorAll('.hud-speed-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const spd = pill.dataset.speed;
      stealthSelectedSpeed = spd === 'instant' ? 15000 : parseInt(spd, 10);
    });
  });

  // Pick Box on Page button
  stealthShadow.getElementById('hudPickBoxBtn')?.addEventListener('click', () => {
    stealthHost.style.display = 'none';

    const pickerNotice = document.createElement('div');
    pickerNotice.id = 'smartpaste-hud-picker-notice';
    pickerNotice.style.cssText = [
      'position: fixed',
      'top: 18px',
      'left: 50%',
      'transform: translateX(-50%)',
      'background: #0f172a',
      'color: #ffffff',
      'padding: 10px 18px',
      'border-radius: 10px',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      'font-size: 13px',
      'font-weight: 600',
      'box-shadow: 0 10px 30px rgba(0,0,0,0.5)',
      'z-index: 2147483647',
      'border: 1px solid #10b981'
    ].join(';');
    pickerNotice.textContent = 'Click inside your exam code editor to lock cursor!';
    document.documentElement.appendChild(pickerNotice);

    let hoveredEl = null;
    function onPickHover(e) {
      if (pickerNotice.contains(e.target)) return;
      if (hoveredEl && hoveredEl !== e.target) hoveredEl.style.outline = '';
      hoveredEl = e.target;
      hoveredEl.style.outline = '3px solid #10b981';
    }

    function onPickClick(e) {
      if (pickerNotice.contains(e.target)) return;
      e.preventDefault();
      e.stopPropagation();

      const resolved = resolveEditableTarget(e.target);
      lastUserFocusedTarget = resolved || e.target;
      state.selectedTarget = lastUserFocusedTarget;

      cleanupPicker();
      stealthHost.style.display = 'block';
      updateHUDTargetStatus();

      if (lastUserFocusedTarget && lastUserFocusedTarget.style) {
        lastUserFocusedTarget.style.outline = '3px solid #10b981';
        setTimeout(() => { if (lastUserFocusedTarget) lastUserFocusedTarget.style.outline = ''; }, 1200);
      }
    }

    function onPickKey(e) {
      if (e.key === 'Escape') {
        cleanupPicker();
        stealthHost.style.display = 'block';
      }
    }

    function cleanupPicker() {
      document.removeEventListener('mouseover', onPickHover, true);
      document.removeEventListener('click', onPickClick, true);
      document.removeEventListener('keydown', onPickKey, true);
      if (hoveredEl) {
        hoveredEl.style.outline = '';
        hoveredEl = null;
      }
      if (pickerNotice) pickerNotice.remove();
    }

    document.addEventListener('mouseover', onPickHover, true);
    document.addEventListener('click', onPickClick, true);
    document.addEventListener('keydown', onPickKey, true);
  });

  // 1-Click Instant Paste button
  stealthShadow.getElementById('hudInstantPasteBtn')?.addEventListener('click', async () => {
    const promptInput = stealthShadow.getElementById('hudPromptInput');
    const textToPaste = stealthLastSolution || (promptInput ? promptInput.value.trim() : '');

    if (!textToPaste) {
      alert('No solution or code to paste! Click Solve with Gemini first.');
      return;
    }

    let target = resolveEditableTarget(lastUserFocusedTarget || state.selectedTarget);
    if (!target || !document.contains(target)) {
      const detected = detectMainExamEditor();
      if (detected && detected.el) {
        target = detected.el;
      }
    }

    if (!target) {
      alert('No exam code editor or active cursor detected. Click "Pick Box" to click your editor first!');
      return;
    }

    state.selectedTarget = target;
    lastUserFocusedTarget = target;

    try { target.focus(); } catch (e) {}

    const success = executeDeepCodePaste(target, textToPaste);

    hideStealthHUD();

    if (success) {
      if (target.style) {
        target.style.outline = '3px solid #10b981';
        setTimeout(() => { if (target) target.style.outline = ''; }, 1200);
      }
    } else {
      // Fallback: startTyping instant
      startTyping({
        text: textToPaste,
        mode: 'instant',
        speed: 15000,
        fixedSpeed: true,
        minDelay: 0,
        maxDelay: 0,
        pauseDuration: 10
      });
    }
  });

  // Auto-type button (Stealth paced or instant)
  stealthShadow.getElementById('hudStartTypeBtn')?.addEventListener('click', async () => {
    const promptInput = stealthShadow.getElementById('hudPromptInput');
    const textToType = stealthLastSolution || (promptInput ? promptInput.value.trim() : '');

    if (!textToType) {
      alert('No solution or text to type! Click Solve with Gemini first.');
      return;
    }

    // Determine target (cursor or detected exam editor)
    let target = resolveEditableTarget(lastUserFocusedTarget || state.selectedTarget);
    if (!target || !document.contains(target)) {
      const detected = detectMainExamEditor();
      if (detected && detected.el) {
        target = detected.el;
      }
    }

    if (!target) {
      alert('No exam code editor or active cursor detected. Click "Pick Box" to click your editor first!');
      return;
    }

    state.selectedTarget = target;
    lastUserFocusedTarget = target;

    try {
      target.focus();
    } catch (e) {}

    // Hide HUD during typing so screen is completely clear for invigilators
    hideStealthHUD();

    const isInstant = stealthSelectedSpeed >= 15000;
    if (isInstant) {
      const directSuccess = executeDeepCodePaste(target, textToType);
      if (directSuccess) return;
    }

    const config = {
      text: textToType,
      mode: isInstant ? 'instant' : 'character',
      speed: stealthSelectedSpeed,
      fixedSpeed: true,
      minDelay: 0,
      maxDelay: 0,
      pauseDuration: 10
    };

    startTyping(config);
  });
}

function showStealthHUD() {
  if (!stealthHost) createStealthHUD();
  if (stealthHost) {
    stealthHost.style.display = 'block';
    updateHUDTargetStatus();
  }
}

function hideStealthHUD() {
  if (stealthHost) {
    stealthHost.style.display = 'none';
  }
}

function toggleStealthHUD() {
  if (!stealthHost || stealthHost.style.display === 'none') {
    showStealthHUD();
  } else {
    hideStealthHUD();
  }
}

// Global stealth keyboard triggers:
// 1. Alt + S  OR  Ctrl + Shift + S  -> Toggle In-Page Fullscreen Stealth HUD
// 2. Alt + H  OR  Escape            -> Instant Panic Hide
document.addEventListener('keydown', (e) => {
  // Toggle HUD: Alt + S or Ctrl + Shift + S
  if ((e.altKey && (e.key === 's' || e.key === 'S')) || (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's'))) {
    e.preventDefault();
    e.stopImmediatePropagation();
    toggleStealthHUD();
    return;
  }

  // Panic Hide: Alt + H or Escape (when HUD is open)
  if ((e.altKey && (e.key === 'h' || e.key === 'H')) || (e.key === 'Escape' && stealthHost && stealthHost.style.display !== 'none')) {
    e.preventDefault();
    e.stopImmediatePropagation();
    hideStealthHUD();
    return;
  }
}, true);

})();
