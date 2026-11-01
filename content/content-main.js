'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  typingActive: false,
  typingPaused: false,
  typingAborted: false,
  currentTimeout: null,
  targetField: null,
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

// ─── Input Field Detector ─────────────────────────────────────────────────────
function detectInputFields() {
  const fields = [];
  const inputs = document.querySelectorAll(
    'input[type="text"], input[type="search"], input[type="email"], input:not([type]), textarea, [contenteditable="true"], [contenteditable=""]'
  );
  
  inputs.forEach((el, idx) => {
    // Skip hidden, disabled, readonly, password fields
    if (el.type === 'password' || el.disabled || el.readOnly) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return; // Hidden
    if (rect.top < 0 || rect.top > window.innerHeight) return; // Off screen
    
    fields.push({
      index: idx,
      tag: el.tagName.toLowerCase(),
      type: el.type || 'contenteditable',
      placeholder: el.placeholder || el.getAttribute('aria-label') || '',
      id: el.id || '',
      name: el.name || '',
      isContentEditable: el.contentEditable === 'true' || el.contentEditable === '',
      rect: { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) }
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
  
  // Find target field
  const fields = detectInputFields().fields;
  const target = targetIndex !== undefined ? 
    document.querySelectorAll('input[type="text"], input[type="search"], input[type="email"], input:not([type]), textarea, [contenteditable="true"], [contenteditable=""]')[targetIndex] :
    fields[0] ? document.querySelectorAll('input[type="text"], input[type="search"], input[type="email"], input:not([type]), textarea, [contenteditable="true"], [contenteditable=""]')[0] : null;
  
  if (!target) {
    return { success: false, error: 'No eligible input field found on this page.' };
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
  
  try {
    switch (state.typingMode) {
      case 'instant':
        await typeInstant(target, text);
        break;
      case 'character':
        await typeByCharacter(target, text, baseDelay, minDelay, maxDelay, fixedSpeed);
        break;
      case 'word':
        await typeByWord(target, text, baseDelay, minDelay, maxDelay, fixedSpeed);
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

async function typeByCharacter(target, text, baseDelay, minDelay, maxDelay, fixedSpeed) {
  const isUltraFast = (fixedSpeed && baseDelay <= 2) || (maxDelay <= 2);
  
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
    
    if (delay > 0) {
      await sleep(delay);
    } else if (isUltraFast && i % 15 === 0) {
      await sleep(0); // Yield to keep UI responsive
    }
    
    if (i % 20 === 0 || i === text.length - 1) {
      sendProgress({ status: 'typing', total: text.length, typed: i + 1 });
    }
  }
}

async function typeByWord(target, text, baseDelay, minDelay, maxDelay, fixedSpeed) {
  const words = text.split(/(\s+)/); // Keep separators
  const isUltraFast = (fixedSpeed && baseDelay <= 2) || (maxDelay <= 2);
  
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
      
    if (delay > 0) {
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

function insertChar(target, char) {
  if (target.isContentEditable || target.contentEditable === 'true') {
    insertContentEditableText(char);
  } else {
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const val = target.value || '';
    target.value = val.substring(0, start) + char + val.substring(end);
    target.selectionStart = target.selectionEnd = start + 1;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function insertText(target, text) {
  if (target.isContentEditable || target.contentEditable === 'true') {
    insertContentEditableText(text);
  } else {
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const val = target.value || '';
    target.value = val.substring(0, start) + text + val.substring(end);
    target.selectionStart = target.selectionEnd = start + text.length;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function insertContentEditableText(text) {
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.setEndAfter(node);
  selection.removeAllRanges();
  selection.addRange(range);
  state.targetField.dispatchEvent(new Event('input', { bubbles: true }));
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
  sendProgress({ status: 'stopped', typed: state.charsTyped });
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
  chrome.runtime.sendMessage({ action: 'typingProgress', ...data }).catch(() => {});
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
