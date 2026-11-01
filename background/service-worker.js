'use strict';

// ─── Storage Keys ────────────────────────────────────────────────────────────
const STORAGE_KEYS = {
  CLIPBOARD_HISTORY: 'clipboard_history',
  SCANNED_PAGES: 'scanned_pages',
  EXTRACTED_QUESTIONS: 'extracted_questions',
  TYPING_SESSIONS: 'typing_sessions',
  SETTINGS: 'settings',
  STATS: 'stats'
};

// ─── Default Settings ─────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  theme: 'dark',
  typingMode: 'character',
  typingSpeed: 60,
  minDelay: 30,
  maxDelay: 120,
  fixedSpeed: false,
  pauseAfterParagraph: true,
  pauseDuration: 500,
  maxClipboardItems: 200,
  autoDetectQuestions: true,
  showNotifications: true
};

const DEFAULT_STATS = {
  totalSaved: 0,
  totalScanned: 0,
  questionsExtracted: 0,
  typingSessions: 0,
  lastActivity: null
};

// ─── Initialization ───────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  // Initialize storage with defaults
  const existing = await chrome.storage.local.get([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.STATS]);
  
  if (!existing[STORAGE_KEYS.SETTINGS]) {
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS });
  }
  if (!existing[STORAGE_KEYS.STATS]) {
    await chrome.storage.local.set({ [STORAGE_KEYS.STATS]: DEFAULT_STATS });
  }

  // Setup context menu
  chrome.contextMenus && setupContextMenus();
});

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'saveSelectedText',
      title: 'Save to SmartPaste Pro',
      contexts: ['selection']
    });
    chrome.contextMenus.create({
      id: 'scanPageContent',
      title: 'Scan Page with SmartPaste Pro',
      contexts: ['page']
    });
  });
}

// ─── Context Menu Handler ─────────────────────────────────────────────────────
if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'saveSelectedText' && info.selectionText) {
      await saveClipboardItem({
        text: info.selectionText,
        sourceUrl: tab.url,
        sourceTitle: tab.title,
        category: 'general',
        label: '',
        savedFrom: 'context_menu'
      });
      showNotification('Text saved to SmartPaste Pro!');
    } else if (info.menuItemId === 'scanPageContent') {
      chrome.tabs.sendMessage(tab.id, { action: 'scanPage' });
    }
  });
}

// ─── Message Handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch(err => {
    console.error('[SmartPaste SW] Error:', err);
    sendResponse({ success: false, error: err.message });
  });
  return true; // Keep message channel open for async
});

async function handleMessage(message, sender) {
  const { action } = message;

  switch (action) {
    case 'getSettings':
      return getSettings();
    case 'saveSettings':
      return saveSettings(message.settings);
    case 'getStats':
      return getStats();
    case 'updateStats':
      return updateStats(message.updates);
    case 'getClipboardHistory':
      return getClipboardHistory(message.filters);
    case 'saveClipboardItem':
      return saveClipboardItem(message.item);
    case 'updateClipboardItem':
      return updateClipboardItem(message.id, message.updates);
    case 'deleteClipboardItem':
      return deleteClipboardItem(message.id);
    case 'clearClipboardHistory':
      return clearClipboardHistory();
    case 'getScannedPages':
      return getScannedPages();
    case 'saveScannedPage':
      return saveScannedPage(message.page);
    case 'deleteScannedPage':
      return deleteScannedPage(message.id);
    case 'getExtractedQuestions':
      return getExtractedQuestions(message.filters);
    case 'saveExtractedQuestions':
      return saveExtractedQuestions(message.questions, message.sourceId);
    case 'deleteExtractedQuestion':
      return deleteExtractedQuestion(message.id);
    case 'getTypingSessions':
      return getTypingSessions();
    case 'saveTypingSession':
      return saveTypingSession(message.session);
    case 'sendToContentScript':
      return sendToContentScript(message.tabId, message.payload);
    case 'getActiveTab':
      return getActiveTab();
    case 'exportData':
      return exportData(message.types);
    case 'importData':
      return importData(message.data);
    case 'clearAllData':
      return clearAllData();
    case 'getStorageUsage':
      return getStorageUsage();
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────
async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return { success: true, settings: result[STORAGE_KEYS.SETTINGS] || DEFAULT_SETTINGS };
}

async function saveSettings(settings) {
  const current = (await chrome.storage.local.get(STORAGE_KEYS.SETTINGS))[STORAGE_KEYS.SETTINGS] || DEFAULT_SETTINGS;
  const merged = { ...current, ...settings };
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: merged });
  return { success: true, settings: merged };
}

// ─── Stats ────────────────────────────────────────────────────────────────────
async function getStats() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.STATS);
  return { success: true, stats: result[STORAGE_KEYS.STATS] || DEFAULT_STATS };
}

async function updateStats(updates) {
  const current = (await chrome.storage.local.get(STORAGE_KEYS.STATS))[STORAGE_KEYS.STATS] || DEFAULT_STATS;
  const merged = { ...current, ...updates, lastActivity: new Date().toISOString() };
  await chrome.storage.local.set({ [STORAGE_KEYS.STATS]: merged });
  return { success: true, stats: merged };
}

// ─── Clipboard History ────────────────────────────────────────────────────────
async function getClipboardHistory(filters = {}) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CLIPBOARD_HISTORY);
  let history = result[STORAGE_KEYS.CLIPBOARD_HISTORY] || [];
  
  // Validate and recover from invalid records
  history = history.filter(item => item && item.id && item.text);
  
  if (filters.category && filters.category !== 'all') {
    history = history.filter(item => item.category === filters.category);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    history = history.filter(item => 
      item.text.toLowerCase().includes(q) || 
      (item.label && item.label.toLowerCase().includes(q))
    );
  }
  if (filters.limit) {
    history = history.slice(0, filters.limit);
  }
  
  return { success: true, items: history };
}

async function saveClipboardItem(item) {
  // Security: never save passwords or sensitive data
  if (isSensitiveContent(item.text)) {
    return { success: false, error: 'Sensitive content detected. Not saved for security.' };
  }
  
  const settings = (await getSettings()).settings;
  const result = await chrome.storage.local.get(STORAGE_KEYS.CLIPBOARD_HISTORY);
  let history = result[STORAGE_KEYS.CLIPBOARD_HISTORY] || [];
  
  const newItem = {
    id: generateId(),
    text: item.text,
    label: item.label || '',
    category: item.category || detectCategory(item.text),
    sourceUrl: item.sourceUrl || '',
    sourceTitle: item.sourceTitle || '',
    savedFrom: item.savedFrom || 'manual',
    timestamp: new Date().toISOString(),
    charCount: item.text.length,
    wordCount: item.text.trim().split(/\s+/).filter(Boolean).length
  };
  
  // Deduplicate recent identical text
  const recentDupe = history.slice(0, 5).find(h => h.text === item.text);
  if (recentDupe) {
    return { success: true, item: recentDupe, duplicate: true };
  }
  
  history.unshift(newItem);
  
  // Enforce max items limit
  if (history.length > settings.maxClipboardItems) {
    history = history.slice(0, settings.maxClipboardItems);
  }
  
  await chrome.storage.local.set({ [STORAGE_KEYS.CLIPBOARD_HISTORY]: history });
  
  // Update stats
  const statsResult = await chrome.storage.local.get(STORAGE_KEYS.STATS);
  const stats = statsResult[STORAGE_KEYS.STATS] || DEFAULT_STATS;
  await chrome.storage.local.set({ 
    [STORAGE_KEYS.STATS]: { ...stats, totalSaved: (stats.totalSaved || 0) + 1, lastActivity: new Date().toISOString() }
  });
  
  return { success: true, item: newItem };
}

async function updateClipboardItem(id, updates) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CLIPBOARD_HISTORY);
  let history = result[STORAGE_KEYS.CLIPBOARD_HISTORY] || [];
  const idx = history.findIndex(item => item.id === id);
  if (idx === -1) return { success: false, error: 'Item not found' };
  history[idx] = { ...history[idx], ...updates, updatedAt: new Date().toISOString() };
  await chrome.storage.local.set({ [STORAGE_KEYS.CLIPBOARD_HISTORY]: history });
  return { success: true, item: history[idx] };
}

async function deleteClipboardItem(id) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CLIPBOARD_HISTORY);
  let history = result[STORAGE_KEYS.CLIPBOARD_HISTORY] || [];
  history = history.filter(item => item.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEYS.CLIPBOARD_HISTORY]: history });
  return { success: true };
}

async function clearClipboardHistory() {
  await chrome.storage.local.set({ [STORAGE_KEYS.CLIPBOARD_HISTORY]: [] });
  return { success: true };
}

// ─── Scanned Pages ────────────────────────────────────────────────────────────
async function getScannedPages() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SCANNED_PAGES);
  return { success: true, pages: result[STORAGE_KEYS.SCANNED_PAGES] || [] };
}

async function saveScannedPage(page) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SCANNED_PAGES);
  let pages = result[STORAGE_KEYS.SCANNED_PAGES] || [];
  
  const newPage = {
    id: generateId(),
    ...page,
    timestamp: new Date().toISOString()
  };
  
  pages.unshift(newPage);
  if (pages.length > 100) pages = pages.slice(0, 100);
  
  await chrome.storage.local.set({ [STORAGE_KEYS.SCANNED_PAGES]: pages });
  
  const statsResult = await chrome.storage.local.get(STORAGE_KEYS.STATS);
  const stats = statsResult[STORAGE_KEYS.STATS] || DEFAULT_STATS;
  await chrome.storage.local.set({
    [STORAGE_KEYS.STATS]: { ...stats, totalScanned: (stats.totalScanned || 0) + 1, lastActivity: new Date().toISOString() }
  });
  
  return { success: true, page: newPage };
}

async function deleteScannedPage(id) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SCANNED_PAGES);
  let pages = (result[STORAGE_KEYS.SCANNED_PAGES] || []).filter(p => p.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEYS.SCANNED_PAGES]: pages });
  return { success: true };
}

// ─── Extracted Questions ──────────────────────────────────────────────────────
async function getExtractedQuestions(filters = {}) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.EXTRACTED_QUESTIONS);
  let questions = result[STORAGE_KEYS.EXTRACTED_QUESTIONS] || [];
  if (filters.sourceId) {
    questions = questions.filter(q => q.sourceId === filters.sourceId);
  }
  return { success: true, questions };
}

async function saveExtractedQuestions(questions, sourceId) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.EXTRACTED_QUESTIONS);
  let existing = result[STORAGE_KEYS.EXTRACTED_QUESTIONS] || [];
  
  const newQuestions = questions.map(q => ({
    id: generateId(),
    sourceId,
    ...q,
    timestamp: new Date().toISOString()
  }));
  
  existing = [...newQuestions, ...existing];
  if (existing.length > 2000) existing = existing.slice(0, 2000);
  
  await chrome.storage.local.set({ [STORAGE_KEYS.EXTRACTED_QUESTIONS]: existing });
  
  const statsResult = await chrome.storage.local.get(STORAGE_KEYS.STATS);
  const stats = statsResult[STORAGE_KEYS.STATS] || DEFAULT_STATS;
  await chrome.storage.local.set({
    [STORAGE_KEYS.STATS]: { ...stats, questionsExtracted: (stats.questionsExtracted || 0) + questions.length, lastActivity: new Date().toISOString() }
  });
  
  return { success: true, questions: newQuestions };
}

async function deleteExtractedQuestion(id) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.EXTRACTED_QUESTIONS);
  let questions = (result[STORAGE_KEYS.EXTRACTED_QUESTIONS] || []).filter(q => q.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEYS.EXTRACTED_QUESTIONS]: questions });
  return { success: true };
}

// ─── Typing Sessions ──────────────────────────────────────────────────────────
async function getTypingSessions() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.TYPING_SESSIONS);
  return { success: true, sessions: result[STORAGE_KEYS.TYPING_SESSIONS] || [] };
}

async function saveTypingSession(session) {
  const result = await chrome.storage.local.get(STORAGE_KEYS.TYPING_SESSIONS);
  let sessions = result[STORAGE_KEYS.TYPING_SESSIONS] || [];
  const newSession = { id: generateId(), ...session, timestamp: new Date().toISOString() };
  sessions.unshift(newSession);
  if (sessions.length > 50) sessions = sessions.slice(0, 50);
  await chrome.storage.local.set({ [STORAGE_KEYS.TYPING_SESSIONS]: sessions });
  
  const statsResult = await chrome.storage.local.get(STORAGE_KEYS.STATS);
  const stats = statsResult[STORAGE_KEYS.STATS] || DEFAULT_STATS;
  await chrome.storage.local.set({
    [STORAGE_KEYS.STATS]: { ...stats, typingSessions: (stats.typingSessions || 0) + 1, lastActivity: new Date().toISOString() }
  });
  
  return { success: true, session: newSession };
}

// ─── Tab Management ───────────────────────────────────────────────────────────
async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) return { success: false, error: 'No active tab' };
  return { success: true, tab: { id: tabs[0].id, url: tabs[0].url, title: tabs[0].title } };
}

async function sendToContentScript(tabId, payload) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, payload);
    return { success: true, response };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── Data Export / Import ─────────────────────────────────────────────────────
async function exportData(types = ['all']) {
  const keys = [];
  if (types.includes('all') || types.includes('clipboard')) keys.push(STORAGE_KEYS.CLIPBOARD_HISTORY);
  if (types.includes('all') || types.includes('pages')) keys.push(STORAGE_KEYS.SCANNED_PAGES);
  if (types.includes('all') || types.includes('questions')) keys.push(STORAGE_KEYS.EXTRACTED_QUESTIONS);
  if (types.includes('all') || types.includes('sessions')) keys.push(STORAGE_KEYS.TYPING_SESSIONS);
  if (types.includes('all') || types.includes('settings')) keys.push(STORAGE_KEYS.SETTINGS);
  
  const data = await chrome.storage.local.get(keys);
  return {
    success: true,
    data: {
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
      ...data
    }
  };
}

async function importData(importedData) {
  const allowed = [
    STORAGE_KEYS.CLIPBOARD_HISTORY,
    STORAGE_KEYS.SCANNED_PAGES,
    STORAGE_KEYS.EXTRACTED_QUESTIONS,
    STORAGE_KEYS.TYPING_SESSIONS,
    STORAGE_KEYS.SETTINGS
  ];
  const toStore = {};
  for (const key of allowed) {
    if (importedData[key] !== undefined) toStore[key] = importedData[key];
  }
  await chrome.storage.local.set(toStore);
  return { success: true };
}

async function clearAllData() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.CLIPBOARD_HISTORY]: [],
    [STORAGE_KEYS.SCANNED_PAGES]: [],
    [STORAGE_KEYS.EXTRACTED_QUESTIONS]: [],
    [STORAGE_KEYS.TYPING_SESSIONS]: [],
    [STORAGE_KEYS.STATS]: DEFAULT_STATS
  });
  return { success: true };
}

async function getStorageUsage() {
  return new Promise(resolve => {
    chrome.storage.local.getBytesInUse(null, (bytes) => {
      resolve({ success: true, bytesUsed: bytes, bytesTotal: 10 * 1024 * 1024 }); // 10MB limit
    });
  });
}

// ─── Helper Functions ─────────────────────────────────────────────────────────
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function isSensitiveContent(text) {
  if (!text) return false;
  const sensitivePatterns = [
    /password\s*[:=]\s*\S+/i,
    /token\s*[:=]\s*[A-Za-z0-9+/]{20,}/i,
    /api[_-]?key\s*[:=]\s*\S+/i,
    /secret\s*[:=]\s*\S+/i,
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b.*\b(?:password|passwd|pwd)\b/i
  ];
  return sensitivePatterns.some(p => p.test(text));
}

function detectCategory(text) {
  if (!text) return 'general';
  const trimmed = text.trim();
  
  // Code detection
  if (/^(function|class|const|let|var|def |import |#include|public |private )/.test(trimmed) ||
      /[{}();]/.test(trimmed) && trimmed.split('\n').length > 2) {
    return 'code';
  }
  
  // Question detection
  if (/\?$/.test(trimmed) || /^\d+[\.\)]\s/.test(trimmed)) {
    return 'question';
  }
  
  // Multi-paragraph article
  if (trimmed.split('\n\n').length > 2 && trimmed.length > 500) {
    return 'article';
  }
  
  // Paragraph
  if (trimmed.split('\n').length > 3 || trimmed.length > 200) {
    return 'paragraph';
  }
  
  return 'general';
}

function showNotification(message) {
  // Notifications require additional permission - use console for now
  console.log('[SmartPaste Pro]', message);
}
