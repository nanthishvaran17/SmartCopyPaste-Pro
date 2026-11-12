'use strict';

// ─── DOM Helpers ──────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

function sendBG(action, data = {}) {
  return chrome.runtime.sendMessage({ action, ...data });
}

async function sendContent(tabId, payload) {
  try {
    return await chrome.tabs.sendMessage(tabId, payload);
  } catch (err) {
    const errMsg = (err && err.message) ? err.message : String(err);
    if (errMsg.includes('Receiving end does not exist') || errMsg.includes('Could not establish connection')) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          files: ['content/content-main.js']
        });
        await new Promise((resolve) => setTimeout(resolve, 90));
        return await chrome.tabs.sendMessage(tabId, payload);
      } catch (injectErr) {
        const iMsg = (injectErr && injectErr.message) ? injectErr.message : '';
        if (iMsg.includes('chrome://') || iMsg.includes('Cannot access a chrome') || iMsg.includes('webstore')) {
          throw new Error('Chrome blocks extensions on internal chrome:// pages and Web Store. Open any normal website or test page.');
        }
        throw new Error(iMsg || errMsg);
      }
    }
    throw err;
  }
}

let toastTimer = null;
function showToast(message, type = 'info', duration = 2500) {
  const toast = $('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = `toast toast--${type}`;
  toast.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.display = 'none';
  }, duration);
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

function truncate(str, max = 65) {
  if (!str) return '';
  return str.length > max ? str.substring(0, max) + '…' : str;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  }
}

// ─── Theme Management ─────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('spp-theme') || 'dark';
  applyTheme(saved);

  const themeToggle = $('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      sendBG('saveSettings', { settings: { theme: next } }).catch(() => { });
    });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('spp-theme', theme);
  const moonIcon = document.querySelector('.icon-moon');
  const sunIcon = document.querySelector('.icon-sun');
  if (moonIcon && sunIcon) {
    if (theme === 'dark') {
      moonIcon.style.display = '';
      sunIcon.style.display = 'none';
    } else {
      moonIcon.style.display = 'none';
      sunIcon.style.display = '';
    }
  }
  const settingTheme = $('settingTheme');
  if (settingTheme && settingTheme.value !== theme) {
    settingTheme.value = theme;
  }
}

// ─── Navigation ───────────────────────────────────────────────────────────────
let currentSection = 'dashboard';

function initNavigation() {
  $$('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      navigateTo(section);
    });
  });
}

function navigateTo(section) {
  currentSection = section;
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.section === section));
  $$('.section').forEach((s) => s.classList.toggle('active', s.id === `section-${section}`));

  if (section === 'dashboard') loadDashboard();
  if (section === 'clipboard') loadClipboard();
  if (section === 'history') loadHistory();
  if (section === 'questions') loadQuestions();
  if (section === 'settings') loadSettings();
  if (section === 'typing') loadTypingDefaults();
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const result = await sendBG('getStats');
    if (result && result.success && result.stats) {
      const { stats } = result;
      if ($('stat-saved')) $('stat-saved').textContent = stats.totalSaved || 0;
      if ($('stat-scanned')) $('stat-scanned').textContent = stats.totalScanned || 0;
      if ($('stat-questions')) $('stat-questions').textContent = stats.questionsExtracted || 0;
      if ($('stat-typing')) $('stat-typing').textContent = stats.typingSessions || 0;
      if ($('lastActivity')) {
        $('lastActivity').textContent = stats.lastActivity
          ? 'Active: ' + formatDate(stats.lastActivity)
          : 'Ready';
      }
    }

    const clipResult = await sendBG('getClipboardHistory', { filters: { limit: 4 } });
    const list = $('activityList');
    if (list) {
      if (clipResult && clipResult.success && clipResult.items && clipResult.items.length > 0) {
        list.innerHTML = clipResult.items
          .map(
            (item) => `
          <div class="recent-clip-pill" data-clip-text="${escapeHtml(item.text)}" title="Click to auto-type this clip">
            <div class="recent-clip-body">
              <span class="recent-clip-text">${escapeHtml(truncate(item.text, 55))}</span>
              <span class="recent-clip-meta">${formatDate(item.timestamp)}</span>
            </div>
            <button type="button" class="recent-clip-load-btn" title="Load into Typer">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </button>
          </div>`
          )
          .join('');
      } else {
        list.innerHTML = '<div class="empty-state">No clips yet. Text you copy on web pages will appear here.</div>';
      }
    }
  } catch (err) {
    console.error('Error loading dashboard:', err);
  }
}

function initDashboard() {
  $('activityList')?.addEventListener('click', (e) => {
    const pill = e.target.closest('.recent-clip-pill');
    if (pill && pill.dataset.clipText) {
      const input = $('easyTextInput');
      if (input) {
        input.value = pill.dataset.clipText;
        if (typeof updateEasyEditorStats === 'function') updateEasyEditorStats();
        input.focus();
        showToast('Clip loaded into Auto-Typer! Click START AUTO-TYPING', 'success');
      }
    }
  });

  $('qa-captureClipboard')?.addEventListener('click', captureClipboard);
  $('qa-scanPage')?.addEventListener('click', () => {
    navigateTo('scanner');
    setTimeout(scanPage, 150);
  });
  $('qa-extractQuestions')?.addEventListener('click', () => {
    navigateTo('questions');
    setTimeout(extractFromPage, 150);
  });
  $('qa-openTyping')?.addEventListener('click', () => navigateTo('typing'));
  initEasyFlow();
}

// ─── 1-Click Magic Workflow (Easy Flow) ──────────────────────────────────────
let easySpeed = 2500;
let easyMode = 'character';
let easyAIProvider = 'gemini';
let easySyncInterval = null;

function updateEasyEditorStats() {
  const input = $('easyTextInput');
  const val = input ? input.value : '';
  const charCount = val.length;
  const wordCount = val.trim() ? val.trim().split(/\s+/).length : 0;
  if ($('easyCharCount')) {
    $('easyCharCount').textContent = `${wordCount} words · ${charCount} chars`;
  }
  if ($('easyClearBtn')) {
    $('easyClearBtn').style.display = charCount > 0 ? 'inline-flex' : 'none';
  }
}

function initEasyFlow() {
  // Sync state immediately on popup open
  syncEasyTypingState();

  // Auto-restore draft text if textarea is empty
  chrome.storage.local.get(['easyDraftText'], (data) => {
    if (data && data.easyDraftText && $('easyTextInput') && !$('easyTextInput').value) {
      $('easyTextInput').value = data.easyDraftText;
      updateEasyEditorStats();
    }
  });

  // Auto-save draft text whenever user types or pastes
  $('easyTextInput')?.addEventListener('input', () => {
    const val = $('easyTextInput').value;
    updateEasyEditorStats();
    chrome.storage.local.set({ easyDraftText: val }).catch(() => {});
  });

  // Clear button
  $('easyClearBtn')?.addEventListener('click', () => {
    if ($('easyTextInput')) {
      $('easyTextInput').value = '';
      updateEasyEditorStats();
      chrome.storage.local.remove('easyDraftText').catch(() => {});
      $('easyTextInput').focus();
    }
  });

  // Step 1: Grab text from webpage
  $('easyGrabBtn')?.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return showToast('No active webpage found', 'error');

      // Try selected text first
      const selRes = await sendContent(tab.id, { action: 'getSelectedText' }).catch(() => null);
      if (selRes && selRes.success && selRes.text && selRes.text.trim()) {
        $('easyTextInput').value = selRes.text.trim();
        updateEasyEditorStats();
        showToast('Selected text grabbed from page!', 'success');
        return;
      }

      // If no text was selected, scan for questions or main content
      const scanRes = await sendContent(tab.id, { action: 'scanPage' }).catch(() => null);
      if (scanRes && scanRes.success && scanRes.data) {
        if (scanRes.data.questions && scanRes.data.questions.length > 0) {
          const q = scanRes.data.questions[0];
          let qText = q.text || '';
          if (q.options && q.options.length > 0) {
            qText += '\n' + q.options.map((o) => `${o.letter}. ${o.text}`).join('\n');
          }
          $('easyTextInput').value = qText;
          updateEasyEditorStats();
          showToast('Question grabbed from page!', 'success');
          return;
        } else if (scanRes.data.codeBlocks && scanRes.data.codeBlocks.length > 0) {
          $('easyTextInput').value = scanRes.data.codeBlocks[0].code;
          updateEasyEditorStats();
          showToast('Code block grabbed from page!', 'success');
          return;
        }
      }

      showToast('No text selected on page. Highlight some text and try again!', 'info');
    } catch (err) {
      showToast('Could not grab from page: ' + err.message, 'error');
    }
  });

  // Step 1: Paste clipboard
  $('easyPasteClipBtn')?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        $('easyTextInput').value = text.trim();
        updateEasyEditorStats();
        showToast('Clipboard text loaded!', 'success');
      } else {
        showToast('Clipboard is empty', 'info');
      }
    } catch (err) {
      showToast('Clipboard permission needed or empty', 'error');
    }
  });

  // Step 2: Collapsible Toggle for AI Section
  const aiToggleBtn = $('easyAiToggleBtn');
  const aiBody = $('easyAiBody');
  const aiChevron = $('easyAiChevron');
  const aiStatusPill = $('easyAiStatusPill');

  function setAiSectionOpen(open) {
    if (!aiBody) return;
    if (open) {
      aiBody.style.display = 'block';
      if (aiChevron) aiChevron.classList.add('open');
      if (aiStatusPill) {
        aiStatusPill.textContent = easyAIProvider.toUpperCase();
        aiStatusPill.style.color = 'var(--primary)';
        aiStatusPill.style.borderColor = 'var(--primary)';
      }
      checkInlineKey();
    } else {
      aiBody.style.display = 'none';
      if (aiChevron) aiChevron.classList.remove('open');
      if (aiStatusPill) {
        aiStatusPill.textContent = 'Click to open';
        aiStatusPill.style.color = '';
        aiStatusPill.style.borderColor = '';
      }
    }
  }

  aiToggleBtn?.addEventListener('click', () => {
    const isCurrentlyOpen = aiBody && aiBody.style.display !== 'none';
    setAiSectionOpen(!isCurrentlyOpen);
  });

  // Step 2: AI Provider selection
  async function checkInlineKey() {
    const settingsRes = await sendBG('getSettings').catch(() => null);
    const keys = settingsRes?.settings?.apiKeys || {};
    const key = keys[easyAIProvider];
    const keyBox = $('easyAiKeyInline');
    const keyInput = $('easyInlineKeyInput');
    if (!key && keyBox) {
      keyBox.style.display = 'flex';
      if (keyInput) keyInput.placeholder = `Paste ${easyAIProvider.toUpperCase()} key (e.g. AQ... or AIza...)`;
    } else if (keyBox) {
      keyBox.style.display = 'none';
    }
  }

  $$('.easy-provider-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      $$('.easy-provider-pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      easyAIProvider = pill.dataset.provider;
      const tag = $('easyAiProviderTag');
      if (tag) tag.textContent = pill.textContent;
      if (aiStatusPill) aiStatusPill.textContent = pill.textContent.toUpperCase();
      checkInlineKey();
    });
  });

  // Save inline key button
  $('easySaveInlineKeyBtn')?.addEventListener('click', async () => {
    const val = $('easyInlineKeyInput')?.value.trim();
    if (!val) {
      showToast('Please enter an API key!', 'info');
      return;
    }
    const settingsRes = await sendBG('getSettings').catch(() => null);
    const current = settingsRes?.settings || {};
    const apiKeys = current.apiKeys || {};
    apiKeys[easyAIProvider] = val;

    await sendBG('saveSettings', { settings: { ...current, apiKeys } });
    showToast(`${easyAIProvider.toUpperCase()} key saved successfully!`, 'success');
    if ($('easyAiKeyInline')) $('easyAiKeyInline').style.display = 'none';
    const fieldId = easyAIProvider === 'chatgpt' ? 'keyChatGPT' : easyAIProvider === 'claude' ? 'keyClaude' : 'keyGemini';
    if ($(fieldId)) $(fieldId).value = val;
  });

  checkInlineKey();

  // Step 2: Ask AI to solve / fix code
  $('easyAiSolveBtn')?.addEventListener('click', async () => {
    const text = $('easyTextInput')?.value.trim();
    if (!text) {
      showToast('Please paste or grab text in Step 1 first!', 'info');
      $('easyTextInput')?.focus();
      return;
    }

    const resultBox = $('easyAiResultBox');
    const resultText = $('easyAiResultText');
    const solveBtn = $('easyAiSolveBtn');

    if (resultBox) resultBox.style.display = 'block';
    if (resultText) resultText.textContent = `Analyzing and solving with ${easyAIProvider.toUpperCase()}...`;
    if (solveBtn) solveBtn.disabled = true;

    try {
      const prompt = `Solve this question or fix and write the complete, clean code for the following:\n\n${text}`;
      const res = await sendBG('generateAI', {
        provider: easyAIProvider,
        prompt,
        task: 'solve'
      });

      if (res && res.success && res.text) {
        if (resultText) resultText.textContent = res.text;
        showToast('AI Solution generated!', 'success');
      } else {
        const errMsg = res?.error || 'AI generation failed. Check API key in Settings or click Open Web AI.';
        if (resultText) resultText.textContent = errMsg;
        showToast(errMsg, 'error');
      }
    } catch (err) {
      if (resultText) resultText.textContent = `Error: ${err.message}`;
      showToast(err.message, 'error');
    } finally {
      if (solveBtn) solveBtn.disabled = false;
    }
  });

  // Step 2: Open Web AI
  $('easyAiWebBtn')?.addEventListener('click', () => {
    const query = $('easyTextInput')?.value.trim();
    sendBG('openAIWeb', { provider: easyAIProvider, query }).catch(() => {});
    showToast(`Opening ${easyAIProvider} in browser...`, 'info');
  });

  // Step 2: Use AI result for typing
  $('easyUseAiResultBtn')?.addEventListener('click', () => {
    const text = $('easyAiResultText')?.textContent.trim();
    if (text) {
      // Remove any stray markdown formatting asterisks
      const cleaned = text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*\n]+)\*/g, '$1').replace(/^#{1,6}\s+/gm, '');
      $('easyTextInput').value = cleaned;
      updateEasyEditorStats();
      showToast('Loaded AI code into Auto-Typer! Click START AUTO-TYPING below.', 'success');
      $('easyStartTypingBtn')?.focus();
    }
  });

  // Step 2: Copy AI result
  $('easyCopyAiBtn')?.addEventListener('click', async () => {
    const text = $('easyAiResultText')?.textContent;
    if (text) {
      const cleaned = text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*\n]+)\*/g, '$1').replace(/^#{1,6}\s+/gm, '');
      await copyToClipboard(cleaned.trim());
      showToast('AI solution copied to clipboard!', 'success');
    }
  });

  // Step 3: Pick Target on Page
  $('easyPickTargetBtn')?.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return showToast('No active webpage found', 'error');

      await sendContent(tab.id, { action: 'startTargetPicker' });
      showToast('Target picker active! Click any box on your page.', 'info');
      setTimeout(() => window.close(), 600);
    } catch (err) {
      showToast('Target picker error: ' + err.message, 'error');
    }
  });

  // Step 3: Speed selection
  $$('.easy-speed-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.easy-speed-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const spd = btn.dataset.speed;
      easyMode = btn.dataset.mode;
      easySpeed = spd === 'instant' ? 2500 : parseInt(spd, 10);
    });
  });

  // Step 3: Start Auto-Typing
  $('easyStartTypingBtn')?.addEventListener('click', async () => {
    const text = $('easyTextInput')?.value;
    if (!text || !text.trim()) {
      showToast('Please enter or paste text to type!', 'info');
      $('easyTextInput')?.focus();
      return;
    }

    chrome.storage.local.set({ easyDraftText: text }).catch(() => {});

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return showToast('No active tab found', 'error');

      const isInstant = easyMode === 'instant';
      const isUltra = easySpeed >= 2000;

      const config = {
        text,
        mode: easyMode,
        speed: easySpeed,
        fixedSpeed: isUltra || isInstant,
        minDelay: isInstant ? 0 : (isUltra ? 0 : Math.max(1, Math.round(60000 / (easySpeed * 6)))),
        maxDelay: isInstant ? 0 : (isUltra ? 1 : Math.max(2, Math.round(60000 / (easySpeed * 4)))),
        pauseDuration: isUltra ? 20 : 150
      };

      const res = await sendContent(tab.id, { action: 'startTyping', config });

      if (res && res.success) {
        if ($('easyStartTypingBtn')) $('easyStartTypingBtn').style.display = 'none';
        if ($('easyStopTypingBtn')) $('easyStopTypingBtn').style.display = 'inline-flex';
        if ($('easyProgressWrap')) $('easyProgressWrap').style.display = 'block';
        if ($('easyProgressBar')) $('easyProgressBar').style.width = '10%';
        if ($('easyProgressPercent')) $('easyProgressPercent').textContent = 'Typing...';
        startEasyPolling();
      } else {
        showToast(res?.error || 'Could not start typing. Click into your code editor on the page first!', 'error');
      }
    } catch (err) {
      showToast('Typing error: ' + err.message, 'error');
    }
  });

  // Step 3: Stop Auto-Typing
  $('easyStopTypingBtn')?.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        await sendContent(tab.id, { action: 'stopTyping' });
      }
    } catch (e) {}

    stopEasyPolling();
    resetEasyTypingUI();
    showToast('Typing stopped.', 'info');
  });

  // Progress message handler
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'typingProgress') {
      const { status, total, typed } = message;
      const bar = $('easyProgressBar');
      const pct = $('easyProgressPercent');
      const st = $('easyProgressStatus');

      if (total && typed !== undefined) {
        const percent = Math.min(100, Math.round((typed / total) * 100));
        if (bar) bar.style.width = `${percent}%`;
        if (pct) pct.textContent = `${percent}%`;
        if (st) st.textContent = `Typed ${typed} / ${total} chars`;
      }

      if (status === 'completed') {
        stopEasyPolling();
        if (bar) bar.style.width = '100%';
        if (pct) pct.textContent = '100%';
        if (st) st.textContent = 'Typing finished!';
        showToast('Auto-typing complete!', 'success');
        setTimeout(resetEasyTypingUI, 1200);
      } else if (status === 'stopped') {
        stopEasyPolling();
        resetEasyTypingUI();
      }
    }
  });
}

async function syncEasyTypingState() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const status = await sendContent(tab.id, { action: 'getTypingStatus' }).catch(() => null);
    if (status && status.success && status.typingActive) {
      if ($('easyStartTypingBtn')) $('easyStartTypingBtn').style.display = 'none';
      if ($('easyStopTypingBtn')) $('easyStopTypingBtn').style.display = 'inline-flex';
      if ($('easyProgressWrap')) $('easyProgressWrap').style.display = 'block';
      if ($('easyTextInput') && status.text) $('easyTextInput').value = status.text;

      const total = status.total || (status.text ? status.text.length : 1);
      const percent = Math.min(100, Math.round((status.charsTyped / total) * 100));
      if ($('easyProgressBar')) $('easyProgressBar').style.width = `${percent}%`;
      if ($('easyProgressPercent')) $('easyProgressPercent').textContent = `${percent}%`;
      if ($('easyProgressStatus')) $('easyProgressStatus').textContent = `Typed ${status.charsTyped} / ${total} chars`;

      startEasyPolling();
    }
  } catch (e) {}
}

function startEasyPolling() {
  clearInterval(easySyncInterval);
  easySyncInterval = setInterval(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      const status = await sendContent(tab.id, { action: 'getTypingStatus' }).catch(() => null);
      if (status && status.success && status.typingActive) {
        const total = status.total || 1;
        const percent = Math.min(100, Math.round((status.charsTyped / total) * 100));
        if ($('easyProgressBar')) $('easyProgressBar').style.width = `${percent}%`;
        if ($('easyProgressPercent')) $('easyProgressPercent').textContent = `${percent}%`;
        if ($('easyProgressStatus')) $('easyProgressStatus').textContent = `Typed ${status.charsTyped} / ${total} chars`;
      } else if (status && !status.typingActive) {
        stopEasyPolling();
        resetEasyTypingUI();
      }
    } catch (e) {
      stopEasyPolling();
    }
  }, 400);
}

function stopEasyPolling() {
  clearInterval(easySyncInterval);
}

function resetEasyTypingUI() {
  if ($('easyStartTypingBtn')) $('easyStartTypingBtn').style.display = 'inline-flex';
  if ($('easyStopTypingBtn')) $('easyStopTypingBtn').style.display = 'none';
  if ($('easyProgressWrap')) $('easyProgressWrap').style.display = 'none';
  if ($('easyProgressBar')) $('easyProgressBar').style.width = '0%';
}

// ─── AI Intelligence Hub (ChatGPT · Claude · Gemini) ─────────────────────────
let currentAIProvider = 'gemini';
let lastAIResponse = '';

function initAI() {
  $('headerAIBtn')?.addEventListener('click', () => {
    navigateTo('dashboard');
    const aiCard = $('aiAssistantCard');
    if (aiCard) {
      const isHidden = window.getComputedStyle(aiCard).display === 'none';
      if (isHidden) {
        aiCard.classList.add('visible');
        setTimeout(() => {
          aiCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          $('aiPrompt')?.focus();
        }, 80);
      } else {
        aiCard.classList.remove('visible');
      }
    }
  });

  // Provider pills
  $$('.ai-provider-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.ai-provider-pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentAIProvider = btn.dataset.aiProvider;
      const label = currentAIProvider === 'chatgpt' ? 'ChatGPT (GPT-4o-mini)' : currentAIProvider === 'claude' ? 'Claude (Claude 3.5)' : 'Gemini (1.5 Flash)';
      if ($('activeAIProviderLabel')) $('activeAIProviderLabel').textContent = label;
      showToast(`Selected: ${label}`, 'info');
    });
  });

  // Quick Task Prompt Chips
  $$('.ai-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const task = chip.dataset.aiTask;
      const promptTa = $('aiPrompt');
      if (!promptTa) return;
      const cur = promptTa.value.trim();

      const prefixes = {
        solve: 'Solve this question step-by-step and provide the final correct answer:\n\n',
        explain: 'Explain this code snippet, identify any bugs, and provide the clean optimized code:\n\n',
        summarize: 'Summarize the following content into clear, concise, bullet points:\n\n',
        humanize: 'Rewrite and polish this text to sound natural, professional, and clear:\n\n'
      };

      if (!cur) {
        promptTa.value = prefixes[task] || '';
      } else {
        promptTa.value = (prefixes[task] || '') + cur;
      }
      promptTa.focus();
    });
  });

  // Load Latest Clipboard
  $('aiLoadClipBtn')?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        const promptTa = $('aiPrompt');
        if (promptTa) {
          promptTa.value = text.trim();
          showToast('Loaded clipboard into AI prompt.', 'info');
        }
      } else {
        showToast('Clipboard is empty.', 'warning');
      }
    } catch {
      showToast('Could not access clipboard.', 'error');
    }
  });

  // Open Web Provider
  $('aiWebBtn')?.addEventListener('click', async () => {
    await sendBG('openAIWeb', { provider: currentAIProvider });
  });

  // Run AI Generation
  $('aiRunBtn')?.addEventListener('click', async () => {
    const prompt = $('aiPrompt')?.value.trim();
    if (!prompt) {
      showToast('Please enter a question or prompt for AI.', 'warning');
      return;
    }

    const runBtn = $('aiRunBtn');
    if (runBtn) {
      runBtn.disabled = true;
      runBtn.textContent = 'Generating…';
    }

    const wrap = $('aiResponseWrap');
    const content = $('aiResponseContent');
    const badge = $('aiProviderBadge');
    if (wrap) wrap.style.display = 'block';
    if (content) content.textContent = `Connecting to ${currentAIProvider.toUpperCase()}…`;

    try {
      const res = await sendBG('callAI', { provider: currentAIProvider, prompt });
      if (res && res.success) {
        lastAIResponse = res.reply;
        if (badge) badge.textContent = `${currentAIProvider.toUpperCase()} Output`;
        if (content) content.textContent = res.reply;
        showToast('AI response generated!', 'success');
      } else {
        const errMsg = res?.error || 'Generation failed.';
        if (content) content.textContent = `Error: ${errMsg}`;
        showToast(errMsg, 'error');
      }
    } catch (err) {
      if (content) content.textContent = `Error: ${err.message}`;
      showToast(err.message, 'error');
    } finally {
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Generate';
      }
    }
  });

  // AI Response Actions
  $('aiCopyBtn')?.addEventListener('click', async () => {
    if (!lastAIResponse) return;
    await copyToClipboard(cleanForTyping(lastAIResponse));
    showToast('AI response copied!', 'success');
  });

  function cleanForTyping(text) {
    if (!text) return '';
    let cleaned = text.trim();
    const codeBlockMatch = cleaned.match(/^```(?:[a-zA-Z0-9_#+-]+)?\s*([\s\S]*?)```$/);
    if (codeBlockMatch) {
      cleaned = codeBlockMatch[1].trim();
    }
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*([^*\n]+)\*/g, '$1');
    cleaned = cleaned.replace(/^#{1,6}\s+/gm, '');
    return cleaned.trim();
  }

  $('aiSendToTypingBtn')?.addEventListener('click', () => {
    if (!lastAIResponse) return;
    const cleanOutput = cleanForTyping(lastAIResponse);
    navigateTo('typing');
    setTimeout(() => {
      const ta = $('typingText');
      if (ta) {
        ta.value = cleanOutput;
        updateTypingCharCount();
      }
      showToast('Loaded AI response into Typing Engine!', 'success');
    }, 120);
  });

  $('aiSaveClipBtn')?.addEventListener('click', async () => {
    if (!lastAIResponse) return;
    const res = await sendBG('saveClipboardItem', {
      item: { text: lastAIResponse, category: 'answer', label: `${currentAIProvider.toUpperCase()} AI Response` }
    });
    if (res && res.success) {
      showToast('Saved to clipboard history!', 'success');
      loadDashboard();
    }
  });
}

// ─── Smart Clipboard ──────────────────────────────────────────────────────────
let clipboardItems = [];

async function captureClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text || !text.trim()) {
      showToast('Clipboard is empty or contains non-text data.', 'warning');
      return;
    }

    const tabResult = await sendBG('getActiveTab');
    const tab = (tabResult && tabResult.success) ? tabResult.tab : {};

    const result = await sendBG('saveClipboardItem', {
      item: {
        text: text.trim(),
        sourceUrl: tab.url || '',
        sourceTitle: tab.title || '',
        savedFrom: 'manual_clipboard'
      }
    });

    if (result && result.success) {
      if (result.duplicate) {
        showToast('Item already exists in history.', 'warning');
      } else {
        showToast('Captured from clipboard!', 'success');
        if (currentSection === 'clipboard') loadClipboard();
        loadDashboard();
      }
    } else {
      showToast(result?.error || 'Failed to capture clipboard.', 'error');
    }
  } catch (err) {
    showToast('Clipboard access denied or unavailable.', 'error');
  }
}

async function loadClipboard() {
  const searchInput = $('clipboardSearch');
  const categoryFilter = $('categoryFilter');
  const search = searchInput ? searchInput.value.trim() : '';
  const category = categoryFilter ? categoryFilter.value : 'all';

  try {
    const result = await sendBG('getClipboardHistory', { filters: { search, category } });
    if (!result || !result.success) {
      showToast('Failed to load clipboard items.', 'error');
      return;
    }
    clipboardItems = result.items || [];
    renderClipboard(clipboardItems);
  } catch (err) {
    console.error('Failed to load clipboard:', err);
  }
}

function renderClipboard(items) {
  const list = $('clipboardList');
  if (!list) return;

  if (!items || !items.length) {
    list.innerHTML = '<div class="empty-state">No saved items found. Capture text or add manually!</div>';
    return;
  }

  list.innerHTML = items
    .map(
      (item) => `
    <div class="clipboard-item" data-id="${escapeHtml(item.id)}">
      <div class="clipboard-item-header">
        <span class="badge badge--${escapeHtml(item.category)}">${escapeHtml(item.category)}</span>
        ${item.label ? `<span style="font-size:10px;color:var(--text-muted);font-weight:600;">${escapeHtml(item.label)}</span>` : ''}
        <span style="margin-left:auto;font-size:10px;color:var(--text-muted);">${item.wordCount || 0} words</span>
      </div>
      <div class="clipboard-item-text">${escapeHtml(item.text)}</div>
      <div class="clipboard-item-meta">
        <span>${formatDate(item.timestamp)}</span>
        ${item.sourceTitle ? `<span>· ${escapeHtml(truncate(item.sourceTitle, 25))}</span>` : ''}
        <span>· ${item.charCount || item.text.length} chars</span>
      </div>
      <div class="clipboard-item-actions">
        <button class="clip-btn clip-btn--primary" data-action="copy" data-id="${escapeHtml(item.id)}">Copy</button>
        <button class="clip-btn" data-action="send-typing" data-id="${escapeHtml(item.id)}">&#8594; Typing</button>
        <button class="clip-btn" data-action="edit" data-id="${escapeHtml(item.id)}">Edit</button>
        <button class="clip-btn clip-btn--danger" data-action="delete" data-id="${escapeHtml(item.id)}">Delete</button>
      </div>
    </div>`
    )
    .join('');

  list.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', handleClipboardAction);
  });
}

async function handleClipboardAction(e) {
  const { action, id } = e.currentTarget.dataset;
  const item = clipboardItems.find((i) => i.id === id);
  if (!item) return;

  if (action === 'copy') {
    await copyToClipboard(item.text);
    showToast('Copied to clipboard!', 'success');
  } else if (action === 'send-typing') {
    navigateTo('typing');
    setTimeout(() => {
      const ta = $('typingText');
      if (ta) {
        ta.value = item.text;
        updateTypingCharCount();
      }
      showToast('Loaded into Typing Engine!', 'success');
    }, 120);
  } else if (action === 'edit') {
    const updated = prompt('Edit content:', item.text);
    if (updated !== null && updated.trim()) {
      const res = await sendBG('updateClipboardItem', {
        id,
        updates: {
          text: updated.trim(),
          charCount: updated.trim().length,
          wordCount: updated.trim().split(/\s+/).filter(Boolean).length
        }
      });
      if (res && res.success) {
        showToast('Updated successfully!', 'success');
        loadClipboard();
      }
    }
  } else if (action === 'delete') {
    if (confirm('Delete this item from history?')) {
      const res = await sendBG('deleteClipboardItem', { id });
      if (res && res.success) {
        showToast('Deleted.', 'info');
        loadClipboard();
        loadDashboard();
      }
    }
  }
}

function initClipboard() {
  let searchTimer = null;
  $('clipboardSearch')?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadClipboard, 250);
  });

  $('categoryFilter')?.addEventListener('change', loadClipboard);
  $('captureClipboardBtn')?.addEventListener('click', captureClipboard);

  $('clearClipboardBtn')?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to clear your entire clipboard history?')) {
      const res = await sendBG('clearClipboardHistory');
      if (res && res.success) {
        showToast('Clipboard history cleared.', 'info');
        loadClipboard();
        loadDashboard();
      }
    }
  });

  $('addManualClipboard')?.addEventListener('click', () => {
    const modal = $('manualAddModal');
    if (modal) {
      modal.style.display = 'flex';
      $('manualText')?.focus();
    }
  });

  $('closeManualModal')?.addEventListener('click', () => {
    $('manualAddModal').style.display = 'none';
  });
  $('cancelManualModal')?.addEventListener('click', () => {
    $('manualAddModal').style.display = 'none';
  });

  $('saveManualModal')?.addEventListener('click', async () => {
    const text = $('manualText')?.value.trim();
    if (!text) {
      showToast('Please enter some text.', 'warning');
      return;
    }
    const label = $('manualLabel')?.value.trim() || '';
    const category = $('manualCategory')?.value || 'general';

    const res = await sendBG('saveClipboardItem', {
      item: { text, label, category, savedFrom: 'manual_input' }
    });

    if (res && res.success) {
      $('manualAddModal').style.display = 'none';
      if ($('manualText')) $('manualText').value = '';
      if ($('manualLabel')) $('manualLabel').value = '';
      showToast('Saved to clipboard!', 'success');
      loadClipboard();
      loadDashboard();
    } else {
      showToast(res?.error || 'Failed to save item.', 'error');
    }
  });
}

// ─── Smart Paste Engine ───────────────────────────────────────────────────────
let currentPasteText = '';

function analyzePaste(text) {
  currentPasteText = text;
  const analysisCard = $('pasteAnalysisCard');
  if (!text || !text.trim()) {
    if (analysisCard) analysisCard.style.display = 'none';
    return;
  }

  const chars = text.length;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const lines = text.split('\n').length;
  const paragraphs = text.split(/\n\s*\n+/).filter((p) => p.trim()).length || 1;

  // Category detection
  let category = 'general';
  const trimmed = text.trim();
  if (/^(function|class|const|let|var|def |import |#include|public |private |interface )/.test(trimmed) ||
    (/[{}();]/.test(trimmed) && lines > 3)) {
    category = 'code';
  } else if (/^\d+[\.\)]\s/m.test(trimmed) || /\?(\s|$)/.test(trimmed)) {
    category = 'question';
  } else if (paragraphs > 2 && chars > 400) {
    category = 'article';
  } else if (lines > 3 || chars > 150) {
    category = 'paragraph';
  }

  $('pasteCharCount').textContent = `${chars} chars`;
  $('pasteWordCount').textContent = `${words} words`;
  $('pasteLineCount').textContent = `${lines} lines`;
  $('pasteParagraphCount').textContent = `${paragraphs} paragraphs`;

  const catBadge = $('pasteCategory');
  if (catBadge) {
    catBadge.textContent = category;
    catBadge.className = `badge badge--${category}`;
  }

  const preview = $('pastePreview');
  if (preview) {
    preview.textContent = text.length > 300 ? text.substring(0, 300) + '…' : text;
  }

  if (analysisCard) analysisCard.style.display = 'block';
}

function cleanText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ \u00A0]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatText(text) {
  return text
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .trim()
        .split('\n')
        .map((l) => l.trim())
        .join('\n')
    )
    .filter(Boolean)
    .join('\n\n');
}

function extractQuestionsFromText(text) {
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
}

function extractParagraphsFromText(text) {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 25);
}

function renderPasteQuestions(questions) {
  const card = $('pasteQuestionsCard');
  const countBadge = $('extractedQCount');
  const list = $('pasteQuestionsList');
  if (!card || !list) return;

  if (!questions || !questions.length) {
    card.style.display = 'none';
    return;
  }

  if (countBadge) countBadge.textContent = questions.length;
  list.innerHTML = questions.map((q) => renderQuestionCard(q)).join('');
  attachQuestionCardEvents(list);
  card.style.display = 'block';
}

function initPaste() {
  const pasteInput = $('pasteInput');
  pasteInput?.addEventListener('input', (e) => {
    analyzePaste(e.target.value);
  });

  $('analyzeBtn')?.addEventListener('click', () => {
    analyzePaste(pasteInput.value);
  });

  $('cleanTextBtn')?.addEventListener('click', () => {
    if (!pasteInput.value.trim()) return;
    const cleaned = cleanText(pasteInput.value);
    pasteInput.value = cleaned;
    analyzePaste(cleaned);
    showToast('Text cleaned & normalized!', 'success');
  });

  $('formatTextBtn')?.addEventListener('click', () => {
    if (!pasteInput.value.trim()) return;
    const formatted = formatText(pasteInput.value);
    pasteInput.value = formatted;
    analyzePaste(formatted);
    showToast('Text formatted!', 'success');
  });

  $('extractQBtn')?.addEventListener('click', () => {
    const text = pasteInput.value;
    if (!text.trim()) {
      showToast('Enter or paste text to extract questions.', 'warning');
      return;
    }
    const questions = extractQuestionsFromText(text);
    if (!questions.length) {
      showToast('No questions detected in the text.', 'warning');
      return;
    }
    renderPasteQuestions(questions);
    showToast(`${questions.length} question(s) extracted!`, 'success');
  });

  $('extractParasBtn')?.addEventListener('click', () => {
    const text = pasteInput.value;
    if (!text.trim()) {
      showToast('Enter or paste text first.', 'warning');
      return;
    }
    const paras = extractParagraphsFromText(text);
    if (!paras.length) {
      showToast('No structured paragraphs detected.', 'warning');
      return;
    }
    renderPasteQuestions(
      paras.map((p, idx) => ({
        number: idx + 1,
        text: p,
        options: [],
        type: 'paragraph',
        confidence: 1.0
      }))
    );
    showToast(`${paras.length} paragraph(s) extracted!`, 'success');
  });

  $('savePasteBtn')?.addEventListener('click', async () => {
    const text = pasteInput.value.trim();
    if (!text) {
      showToast('Nothing to save.', 'warning');
      return;
    }
    const res = await sendBG('saveClipboardItem', {
      item: { text, savedFrom: 'smart_paste_editor' }
    });
    if (res && res.success) {
      showToast('Saved to clipboard history!', 'success');
      loadDashboard();
    } else {
      showToast(res?.error || 'Failed to save.', 'error');
    }
  });

  $('copyPasteBtn')?.addEventListener('click', async () => {
    const text = pasteInput.value.trim();
    if (!text) {
      showToast('Nothing to copy.', 'warning');
      return;
    }
    await copyToClipboard(text);
    showToast('Copied to clipboard!', 'success');
  });

  $('exportPasteBtn')?.addEventListener('click', () => {
    const text = pasteInput.value.trim();
    if (!text) {
      showToast('Nothing to export.', 'warning');
      return;
    }
    downloadText(text, `smartpaste-content-${Date.now()}.txt`);
    showToast('Content exported!', 'success');
  });

  $('sendToTypingBtn')?.addEventListener('click', () => {
    const text = pasteInput.value.trim();
    if (!text) {
      showToast('No content to send.', 'warning');
      return;
    }
    navigateTo('typing');
    setTimeout(() => {
      const ta = $('typingText');
      if (ta) {
        ta.value = text;
        updateTypingCharCount();
      }
      showToast('Sent to Typing Engine!', 'success');
    }, 120);
  });
}

// ─── Website Intelligence Scanner ─────────────────────────────────────────────
let lastScanResult = null;

async function scanPage() {
  const scanBtn = $('scanPageBtn');
  const status = $('scanStatus');
  if (scanBtn) scanBtn.disabled = true;
  if (status) status.textContent = 'Scanning webpage structure…';

  try {
    const tabResult = await sendBG('getActiveTab');
    if (!tabResult || !tabResult.success) {
      throw new Error('Could not access active tab.');
    }
    const { tab } = tabResult;
    if (
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('edge://') ||
      tab.url.startsWith('about:')
    ) {
      throw new Error('Chrome extensions cannot scan internal browser pages.');
    }

    // Ping content script; inject if not yet loaded
    let isReady = false;
    try {
      const ping = await sendContent(tab.id, { action: 'ping' });
      isReady = ping && ping.success;
    } catch { }

    if (!isReady) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/content-main.js']
        });
        await new Promise((r) => setTimeout(r, 350));
      } catch (err) {
        throw new Error('Please refresh the target webpage and try again.');
      }
    }

    const response = await sendContent(tab.id, { action: 'scanPage' });
    if (!response || !response.success) {
      throw new Error(response?.error || 'Page scan failed.');
    }

    lastScanResult = response.data;
    renderScanResults(response.data);
    if (status) {
      status.textContent = `Completed! ${response.data.wordCount?.toLocaleString() || 0} words extracted.`;
    }
    $('scanResults').style.display = 'block';
    showToast('Page scanned successfully!', 'success');
    loadDashboard();
  } catch (err) {
    if (status) status.textContent = `Error: ${err.message}`;
    showToast(err.message, 'error');
  } finally {
    if (scanBtn) scanBtn.disabled = false;
  }
}

function renderScanResults(data) {
  if ($('scanTitle')) $('scanTitle').textContent = data.title || '–';
  if ($('scanDomain')) $('scanDomain').textContent = data.domain || '–';
  if ($('scanWordCount')) $('scanWordCount').textContent = data.wordCount?.toLocaleString() || '–';
  if ($('scanHeadingsCount')) $('scanHeadingsCount').textContent = data.headings?.length || 0;
  if ($('scanQuestionsCount')) $('scanQuestionsCount').textContent = data.questions?.length || 0;

  // Headings
  const headList = $('headingsList');
  if (headList) {
    if (data.headings && data.headings.length) {
      headList.innerHTML = data.headings
        .map(
          (h) => `
        <div class="result-item">
          <span style="flex:1;"><strong style="color:var(--accent);">H${h.level}</strong> ${escapeHtml(h.text)}</span>
          <button class="result-copy" data-text="${escapeHtml(h.text)}">Copy</button>
        </div>`
        )
        .join('');
      headList.querySelectorAll('.result-copy').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await copyToClipboard(btn.dataset.text);
          showToast('Heading copied!', 'success');
        });
      });
    } else {
      headList.innerHTML = '<div class="empty-state">No headings detected.</div>';
    }
  }

  // Paragraphs
  const paraList = $('paragraphsList');
  if (paraList) {
    if (data.paragraphs && data.paragraphs.length) {
      paraList.innerHTML = data.paragraphs
        .slice(0, 25)
        .map(
          (p) => `
        <div class="result-item">
          <span style="flex:1;line-height:1.4;">${escapeHtml(truncate(p, 110))}</span>
          <button class="result-copy" data-text="${escapeHtml(p)}">Copy</button>
        </div>`
        )
        .join('');
      paraList.querySelectorAll('.result-copy').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await copyToClipboard(btn.dataset.text);
          showToast('Paragraph copied!', 'success');
        });
      });
    } else {
      paraList.innerHTML = '<div class="empty-state">No paragraphs detected.</div>';
    }
  }

  // Code Blocks
  const codeList = $('codeBlocksList');
  if (codeList) {
    if (data.codeBlocks && data.codeBlocks.length) {
      codeList.innerHTML = data.codeBlocks
        .map(
          (b) => `
        <div class="result-item" style="flex-direction:column;align-items:flex-start;">
          ${b.language ? `<span class="badge badge--code" style="margin-bottom:4px;">${escapeHtml(b.language)}</span>` : ''}
          <code style="font-family:monospace;font-size:10px;white-space:pre-wrap;word-break:break-all;">${escapeHtml(truncate(b.code, 200))}</code>
          <button class="result-copy" style="margin-top:6px;" data-text="${escapeHtml(b.code)}">Copy Snippet</button>
        </div>`
        )
        .join('');
      codeList.querySelectorAll('.result-copy').forEach((btn) => {
        btn.addEventListener('click', async () => {
          await copyToClipboard(btn.dataset.text);
          showToast('Code snippet copied!', 'success');
        });
      });
    } else {
      codeList.innerHTML = '<div class="empty-state">No code blocks detected.</div>';
    }
  }

  if (data.questions && data.questions.length) {
    currentExtractedQuestions = data.questions;
  }
}

function initScanner() {
  $('scanPageBtn')?.addEventListener('click', scanPage);

  $('saveScanBtn')?.addEventListener('click', async () => {
    if (!lastScanResult) {
      showToast('No scan result available to save.', 'warning');
      return;
    }
    const res = await sendBG('saveScannedPage', { page: lastScanResult });
    if (res && res.success) {
      showToast('Scan saved to history!', 'success');
      loadDashboard();
    } else {
      showToast('Failed to save scan.', 'error');
    }
  });

  $('exportScanBtn')?.addEventListener('click', () => {
    if (!lastScanResult) {
      showToast('No scan data to export.', 'warning');
      return;
    }
    downloadJSON(lastScanResult, `web-scan-${Date.now()}.json`);
    showToast('Scan exported as JSON!', 'success');
  });

  $('copyHeadingsBtn')?.addEventListener('click', async () => {
    if (!lastScanResult?.headings?.length) {
      showToast('No headings to copy.', 'warning');
      return;
    }
    const text = lastScanResult.headings.map((h) => `${'#'.repeat(h.level)} ${h.text}`).join('\n');
    await copyToClipboard(text);
    showToast('All headings copied!', 'success');
  });

  $('copyParagraphsBtn')?.addEventListener('click', async () => {
    if (!lastScanResult?.paragraphs?.length) {
      showToast('No paragraphs to copy.', 'warning');
      return;
    }
    await copyToClipboard(lastScanResult.paragraphs.join('\n\n'));
    showToast('All paragraphs copied!', 'success');
  });

  $('copyCodeBtn')?.addEventListener('click', async () => {
    if (!lastScanResult?.codeBlocks?.length) {
      showToast('No code snippets to copy.', 'warning');
      return;
    }
    const code = lastScanResult.codeBlocks.map((b) => b.code).join('\n\n/* ────────────────── */\n\n');
    await copyToClipboard(code);
    showToast('All code snippets copied!', 'success');
  });
}

// ─── Question Extractor ───────────────────────────────────────────────────────
let currentExtractedQuestions = [];

function renderQuestionCard(q) {
  const optionsHtml =
    q.options && q.options.length
      ? `<div class="question-options">
          ${q.options
        .map(
          (o) => `
            <div class="question-option">
              <span class="option-letter">${escapeHtml(o.letter)}.</span>
              <span>${escapeHtml(o.text)}</span>
            </div>`
        )
        .join('')}
        </div>`
      : '';

  const confidencePct = Math.round((q.confidence || 0.8) * 100);
  const typeBadge = q.type === 'mcq' ? 'MCQ' : q.type === 'paragraph' ? 'Para' : 'Open';

  return `
    <div class="question-card" data-num="${q.number}" data-id="${escapeHtml(q.id || String(q.number))}">
      <div class="question-header">
        <div class="question-num">${q.number}</div>
        <div class="question-text">${escapeHtml(q.text)}</div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0;">
          <span class="badge ${q.type === 'mcq' ? 'badge--question' : ''}">${typeBadge}</span>
          <span class="question-confidence">${confidencePct}%</span>
        </div>
      </div>
      ${optionsHtml}
      <div class="question-actions">
        <button class="clip-btn clip-btn--primary" data-q-action="copy" data-num="${q.number}">Copy</button>
        <button class="clip-btn" data-q-action="save" data-num="${q.number}">Save</button>
        <button class="clip-btn" data-q-action="type" data-num="${q.number}">&#8594; Typing</button>
        ${q.id ? `<button class="clip-btn clip-btn--danger" data-q-action="delete" data-id="${escapeHtml(q.id)}">Delete</button>` : ''}
      </div>
    </div>`;
}

function attachQuestionCardEvents(container) {
  container.querySelectorAll('[data-q-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.qAction;
      const num = parseInt(btn.dataset.num);
      const id = btn.dataset.id;
      const q = currentExtractedQuestions.find((item) => item.number === num || item.id === id);
      if (!q && !id) return;

      let formattedText = q ? `${q.number}. ${q.text}` : '';
      if (q && q.options && q.options.length) {
        formattedText += '\n' + q.options.map((o) => `   ${o.letter}. ${o.text}`).join('\n');
      }

      if (action === 'copy') {
        await copyToClipboard(formattedText);
        showToast('Question copied!', 'success');
      } else if (action === 'save') {
        const res = await sendBG('saveClipboardItem', {
          item: { text: formattedText, category: 'question', savedFrom: 'question_extractor' }
        });
        if (res && res.success) {
          showToast('Question saved to clipboard!', 'success');
          loadDashboard();
        }
      } else if (action === 'type') {
        navigateTo('typing');
        setTimeout(() => {
          const ta = $('typingText');
          if (ta) {
            ta.value = formattedText;
            updateTypingCharCount();
          }
          showToast('Loaded into Typing Engine!', 'success');
        }, 120);
      } else if (action === 'delete') {
        const res = await sendBG('deleteExtractedQuestion', { id });
        if (res && res.success) {
          showToast('Deleted from history.', 'info');
          loadQuestions();
          loadDashboard();
        }
      }
    });
  });
}

async function loadQuestions() {
  try {
    const searchVal = $('questionSearch') ? $('questionSearch').value.toLowerCase().trim() : '';
    const res = await sendBG('getExtractedQuestions', { filters: {} });
    const container = $('questionsContainer');
    if (!container) return;

    if (!res || !res.success || !res.questions || !res.questions.length) {
      if (!currentExtractedQuestions.length) {
        container.innerHTML = '<div class="empty-state">No questions found. Click "Extract from Page" or scan a webpage!</div>';
        return;
      }
    } else {
      currentExtractedQuestions = res.questions;
    }

    let questions = currentExtractedQuestions;
    if (searchVal) {
      questions = questions.filter(
        (q) =>
          q.text.toLowerCase().includes(searchVal) ||
          (q.options && q.options.some((o) => o.text.toLowerCase().includes(searchVal)))
      );
    }

    if (!questions.length) {
      container.innerHTML = '<div class="empty-state">No questions match your search.</div>';
      return;
    }

    container.innerHTML = questions.map((q) => renderQuestionCard(q)).join('');
    attachQuestionCardEvents(container);
  } catch (err) {
    console.error('Failed to load questions:', err);
  }
}

async function extractFromPage() {
  const container = $('questionsContainer');
  if (container) {
    container.innerHTML = '<div class="empty-state">Scanning active page for questions and MCQ options…</div>';
  }

  try {
    const tabResult = await sendBG('getActiveTab');
    if (!tabResult || !tabResult.success) throw new Error('No active tab available.');
    const { tab } = tabResult;

    if (
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('about:')
    ) {
      throw new Error('Cannot extract from internal browser pages.');
    }

    // Ping / inject content script
    let isReady = false;
    try {
      const ping = await sendContent(tab.id, { action: 'ping' });
      isReady = ping && ping.success;
    } catch { }

    if (!isReady) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/content-main.js']
        });
        await new Promise((r) => setTimeout(r, 350));
      } catch (e) {
        throw new Error('Could not inject into page. Please reload the webpage.');
      }
    }

    const res = await sendContent(tab.id, { action: 'extractQuestions' });
    if (!res || !res.success) throw new Error(res?.error || 'Extraction failed.');

    const questions = res.questions || [];
    if (!questions.length) {
      if (container) {
        container.innerHTML = '<div class="empty-state">No questions or quiz elements found on this page.</div>';
      }
      showToast('No questions detected.', 'warning');
      return;
    }

    // Save to storage
    const sourceId = `page-${Date.now()}`;
    await sendBG('saveExtractedQuestions', { questions, sourceId });

    currentExtractedQuestions = questions;
    loadQuestions();
    showToast(`${questions.length} question(s) successfully extracted!`, 'success');
    loadDashboard();
  } catch (err) {
    if (container) {
      container.innerHTML = `<div class="empty-state">Error: ${escapeHtml(err.message)}</div>`;
    }
    showToast(err.message, 'error');
  }
}

function initQuestions() {
  let searchTimer = null;
  $('questionSearch')?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadQuestions, 250);
  });

  $('extractFromPageBtn')?.addEventListener('click', extractFromPage);

  $('copyAllQuestionsBtn')?.addEventListener('click', async () => {
    if (!currentExtractedQuestions.length) {
      showToast('No questions to copy.', 'warning');
      return;
    }
    const text = currentExtractedQuestions
      .map((q) => {
        let block = `${q.number}. ${q.text}`;
        if (q.options && q.options.length) {
          block += '\n' + q.options.map((o) => `   ${o.letter}. ${o.text}`).join('\n');
        }
        return block;
      })
      .join('\n\n');
    await copyToClipboard(text);
    showToast(`Copied ${currentExtractedQuestions.length} questions!`, 'success');
  });

  $('saveAllQuestionsBtn')?.addEventListener('click', async () => {
    if (!currentExtractedQuestions.length) {
      showToast('No questions to save.', 'warning');
      return;
    }
    for (const q of currentExtractedQuestions) {
      let block = `${q.number}. ${q.text}`;
      if (q.options && q.options.length) {
        block += '\n' + q.options.map((o) => `   ${o.letter}. ${o.text}`).join('\n');
      }
      await sendBG('saveClipboardItem', {
        item: { text: block, category: 'question', savedFrom: 'batch_save' }
      });
    }
    showToast(`Saved ${currentExtractedQuestions.length} questions to clipboard!`, 'success');
    loadDashboard();
  });

  $('exportQuestionsBtn')?.addEventListener('click', () => {
    if (!currentExtractedQuestions.length) {
      showToast('No questions to export.', 'warning');
      return;
    }
    const text = currentExtractedQuestions
      .map((q) => {
        let block = `${q.number}. ${q.text}`;
        if (q.options && q.options.length) {
          block += '\n' + q.options.map((o) => `   ${o.letter}. ${o.text}`).join('\n');
        }
        return block;
      })
      .join('\n\n');
    downloadText(text, `questions-export-${Date.now()}.txt`);
    showToast('Questions exported!', 'success');
  });
}

// ─── Human-Like Controlled Typing Engine ──────────────────────────────────────
let selectedFieldIndex = null;
let typingState = { active: false, paused: false };

function updateTypingCharCount() {
  const ta = $('typingText');
  const text = ta ? ta.value : '';
  if ($('typingCharCount')) $('typingCharCount').textContent = text.length;
  if ($('typingWordCountDisplay')) {
    const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
    $('typingWordCountDisplay').textContent = `${words} words`;
  }
}

function renderCustomClipPickerList(items, filter = '') {
  const listEl = $('clipPickerList');
  if (!listEl) return;
  const filtered = filter
    ? items.filter((i) => (i.text || '').toLowerCase().includes(filter.toLowerCase()) || (i.category || '').toLowerCase().includes(filter.toLowerCase()))
    : items;
  if (!filtered || filtered.length === 0) {
    listEl.innerHTML = '<div class="clip-picker-empty">No matching clips found</div>';
    return;
  }
  listEl.innerHTML = filtered
    .map(
      (item) => `
    <div class="clip-picker-item" data-id="${escapeHtml(item.id)}">
      <div class="clip-picker-item-left">
        <span class="clip-picker-badge badge-${escapeHtml(item.category || 'text')}">${escapeHtml((item.category || 'text').toUpperCase())}</span>
        <span class="clip-picker-item-text">${escapeHtml(truncate(item.text, 44))}</span>
      </div>
      <div class="clip-picker-item-meta">${item.wordCount || 0}w</div>
    </div>`
    )
    .join('');
}

function loadTypingDefaults() {
  loadSavedItemsIntoTypingSelector();
  sendBG('getSettings').then((res) => {
    if (!res || !res.success || !res.settings) return;
    const s = res.settings;
    const modeRadio = document.querySelector(
      `input[name="typingMode"][value="${s.typingMode || 'character'}"]`
    );
    if (modeRadio) modeRadio.checked = true;

    if ($('typingSpeedSlider')) $('typingSpeedSlider').value = s.typingSpeed || 60;
    if ($('typingSpeedValue')) $('typingSpeedValue').textContent = s.typingSpeed || 60;
    if ($('minDelay')) $('minDelay').value = s.minDelay !== undefined ? s.minDelay : 30;
    if ($('maxDelay')) $('maxDelay').value = s.maxDelay !== undefined ? s.maxDelay : 120;
    if ($('fixedSpeed')) $('fixedSpeed').checked = s.fixedSpeed === true;
    if ($('pauseDuration')) $('pauseDuration').value = s.pauseDuration || 500;
  });
}

async function loadSavedItemsIntoTypingSelector() {
  const sel = $('savedClipSelector');
  try {
    const res = await sendBG('getClipboardHistory', { filters: {} });
    if (!res || !res.success || !res.items) return;
    clipboardItems = res.items;

    if (sel) {
      sel.innerHTML = '<option value="">Load from Saved Clipboard Items...</option>' +
        res.items.map(item => `
          <option value="${escapeHtml(item.id)}">
            [${escapeHtml(item.category)}] ${escapeHtml(truncate(item.text, 40))} (${item.wordCount || 0}w)
          </option>
        `).join('');
    }

    renderCustomClipPickerList(clipboardItems);
  } catch (err) {
    console.error('Failed to populate saved items selector:', err);
  }
}

async function detectFields() {
  const btn = $('detectFieldsBtn');
  const list = $('fieldsList');
  if (btn) btn.disabled = true;
  if (list) list.innerHTML = '<div class="empty-state">Scanning webpage for editable inputs...</div>';

  try {
    const tabResult = await sendBG('getActiveTab');
    if (!tabResult || !tabResult.success) throw new Error('No active tab found.');
    const { tab } = tabResult;

    if (
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('about:')
    ) {
      throw new Error('Cannot type into internal browser pages.');
    }

    let isReady = false;
    try {
      const ping = await sendContent(tab.id, { action: 'ping' });
      isReady = ping && ping.success;
    } catch { }

    if (!isReady) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/content-main.js']
        });
        await new Promise((r) => setTimeout(r, 350));
      } catch (err) {
        throw new Error('Could not inject content script into this page.');
      }
    }

    const res = await sendContent(tab.id, { action: 'detectInputFields' });
    if (!res || !res.success) throw new Error(res?.error || 'Field detection failed.');

    renderFieldsList(res.fields || [], tab.id);
  } catch (err) {
    if (list) list.innerHTML = `<div class="empty-state">Error: ${escapeHtml(err.message)}</div>`;
    showToast(err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function renderFieldsList(fields, tabId) {
  const list = $('fieldsList');
  if (!list) return;

  if (!fields.length) {
    list.innerHTML =
      '<div class="empty-state">No editable input fields, textareas, or rich-text editors detected.</div>';
    return;
  }

  list.innerHTML = fields
    .map(
      (f) => `
    <div class="field-item" data-index="${f.index}" data-tabid="${tabId}">
      <span class="field-tag">${escapeHtml(f.tag)}</span>
      <span style="flex:1;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${f.placeholder ? `"${escapeHtml(truncate(f.placeholder, 35))}"` : f.id ? `#${escapeHtml(f.id)}` : f.name ? `[name="${escapeHtml(f.name)}"]` : 'Text input'}
      </span>
      <span style="font-size:10px;color:var(--text-muted);">${f.rect?.width || 0}×${f.rect?.height || 0}</span>
    </div>`
    )
    .join('');

  list.querySelectorAll('.field-item').forEach((item) => {
    item.addEventListener('click', async () => {
      list.querySelectorAll('.field-item').forEach((el) => el.classList.remove('selected'));
      item.classList.add('selected');
      selectedFieldIndex = parseInt(item.dataset.index);
      const tId = parseInt(item.dataset.tabid);

      try {
        await sendContent(tId, { action: 'highlightField', fieldIndex: selectedFieldIndex });
      } catch { }

      updateTypingConfirm(item);
      $('typingConfirmCard').style.display = 'block';
    });
  });
}

function updateTypingConfirm(fieldItem) {
  const mode = document.querySelector('input[name="typingMode"]:checked')?.value || 'character';
  const speed = $('typingSpeedSlider')?.value || 60;
  const text = $('typingText')?.value || '';
  const label =
    fieldItem.querySelector('span:nth-child(2)')?.textContent.trim() || 'Selected element';

  if ($('confirmTarget')) $('confirmTarget').textContent = label;
  if ($('confirmMode')) $('confirmMode').textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
  if ($('confirmSpeed')) $('confirmSpeed').textContent = `${speed} WPM`;
  if ($('confirmChars')) $('confirmChars').textContent = text.length;
}

async function startTyping() {
  const text = $('typingText')?.value;
  if (!text || !text.trim()) {
    showToast('Please enter text to type.', 'warning');
    return;
  }
  if (selectedFieldIndex === null) {
    showToast('Please select a target field first.', 'warning');
    return;
  }

  const tabResult = await sendBG('getActiveTab');
  if (!tabResult || !tabResult.success) {
    showToast('No active tab available.', 'error');
    return;
  }

  const config = {
    text,
    mode: document.querySelector('input[name="typingMode"]:checked')?.value || 'character',
    speed: parseInt($('typingSpeedSlider')?.value || 60),
    minDelay: parseInt($('minDelay')?.value || 30),
    maxDelay: parseInt($('maxDelay')?.value || 120),
    fixedSpeed: $('fixedSpeed')?.checked === true,
    targetIndex: selectedFieldIndex,
    pauseDuration: parseInt($('pauseDuration')?.value || 500)
  };

  typingState.active = true;
  typingState.paused = false;

  $('typingConfirmCard').style.display = 'none';
  $('typingProgressCard').style.display = 'block';
  $('typingProgressBar').style.width = '0%';
  $('typingProgressPct').textContent = '0%';
  $('liveCharsTyped').textContent = '0';
  $('liveWordsTyped').textContent = '0';
  $('liveSpeed').textContent = `${config.speed}`;
  $('liveETA').textContent = 'Estimating…';
  $('typingStatusBadge').textContent = 'Typing…';

  $('pauseTypingBtn').disabled = false;
  $('stopTypingBtn').disabled = false;
  $('resumeTypingBtn').disabled = true;
  $('restartTypingBtn').disabled = true;

  try {
    await sendContent(tabResult.tab.id, { action: 'startTyping', config });
  } catch (err) {
    showToast(`Typing error: ${err.message}`, 'error');
  }

  // Record typing session in history
  await sendBG('saveTypingSession', {
    session: {
      textLength: text.length,
      mode: config.mode,
      speed: config.speed,
      completed: !typingState.active
    }
  });

  typingState.active = false;
  if ($('pauseTypingBtn')) $('pauseTypingBtn').disabled = true;
  if ($('stopTypingBtn')) $('stopTypingBtn').disabled = true;
  if ($('resumeTypingBtn')) $('resumeTypingBtn').disabled = true;
  if ($('restartTypingBtn')) $('restartTypingBtn').disabled = false;
  if ($('typingStatusBadge')) $('typingStatusBadge').textContent = 'Completed';
  loadDashboard();
}

function initTyping() {
  $('typingText')?.addEventListener('input', updateTypingCharCount);

  // Speed Presets
  const presets = {
    normal: { speed: 60, min: 30, max: 120, mode: 'character', tag: 'Normal 60 WPM' },
    wpm100: { speed: 100, min: 20, max: 60, mode: 'character', tag: '100 WPM' },
    wpm200: { speed: 200, min: 10, max: 30, mode: 'character', tag: '200 WPM' },
    fast: { speed: 180, min: 10, max: 40, mode: 'character', tag: 'Fast 180 WPM' },
    ultra: { speed: 500, min: 2, max: 10, mode: 'character', tag: 'Ultra 500 WPM' },
    extreme: { speed: 1000, min: 0, max: 3, mode: 'character', tag: 'Extreme 1000 WPM' },
    turbo: { speed: 2500, min: 0, max: 1, mode: 'character', tag: 'Turbo 2500 WPM' },
    sonic: { speed: 5000, min: 0, max: 0, mode: 'character', tag: 'Sonic 5000 WPM' },
    hyper: { speed: 7500, min: 0, max: 0, mode: 'character', tag: 'Hyper 7500 WPM' },
    god: { speed: 10000, min: 0, max: 0, mode: 'character', tag: 'God 10000 WPM' },
    max: { speed: 15000, min: 0, max: 0, mode: 'character', tag: 'Max 15000 WPM' },
    instant: { speed: 15000, min: 0, max: 0, mode: 'instant', tag: 'Instant (0 ms)' }
  };

  $$('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = presets[btn.dataset.preset];
      if (!p) return;
      $$('.preset-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      if ($('typingSpeedSlider')) $('typingSpeedSlider').value = p.speed;
      if ($('typingSpeedValue')) $('typingSpeedValue').textContent = p.speed;
      if ($('minDelay')) $('minDelay').value = p.min;
      if ($('maxDelay')) $('maxDelay').value = p.max;
      if ($('speedTag')) $('speedTag').textContent = p.tag;

      const radio = document.querySelector(`input[name="typingMode"][value="${p.mode}"]`);
      if (radio) radio.checked = true;

      showToast(`Speed: ${p.tag}`, 'info');
    });
  });

  // Custom Luxury Clip Picker Events
  const pickerTrigger = $('clipPickerTrigger');
  const pickerDropdown = $('clipPickerDropdown');
  const pickerSearch = $('clipPickerSearch');
  const pickerList = $('clipPickerList');

  pickerTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = pickerDropdown && pickerDropdown.style.display !== 'none';
    if (pickerDropdown) pickerDropdown.style.display = isOpen ? 'none' : 'block';
    pickerTrigger.classList.toggle('open', !isOpen);
    if (!isOpen && pickerSearch) {
      pickerSearch.value = '';
      renderCustomClipPickerList(clipboardItems);
      setTimeout(() => pickerSearch.focus(), 50);
    }
  });

  pickerSearch?.addEventListener('input', (e) => {
    renderCustomClipPickerList(clipboardItems, e.target.value.trim());
  });

  pickerList?.addEventListener('click', (e) => {
    const itemEl = e.target.closest('.clip-picker-item');
    if (!itemEl) return;
    const chosenId = itemEl.dataset.id;
    const item = clipboardItems.find((i) => i.id === chosenId);
    if (item) {
      if ($('typingText')) {
        $('typingText').value = item.text;
        updateTypingCharCount();
      }
      if ($('clipPickerSelectedText')) {
        $('clipPickerSelectedText').textContent = truncate(item.text, 36);
      }
      if ($('savedClipSelector')) {
        $('savedClipSelector').value = item.id;
      }
      if (pickerDropdown) pickerDropdown.style.display = 'none';
      pickerTrigger?.classList.remove('open');
      showToast('Loaded saved clip into Typing Engine!', 'success');
    }
  });

  // Close custom picker on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#customClipPicker')) {
      if (pickerDropdown) pickerDropdown.style.display = 'none';
      pickerTrigger?.classList.remove('open');
    }
  });

  // Saved Clipboard Item loader (native fallback)
  $('savedClipSelector')?.addEventListener('change', (e) => {
    const chosenId = e.target.value;
    if (!chosenId) return;
    const item = clipboardItems.find((i) => i.id === chosenId);
    if (item) {
      if ($('typingText')) {
        $('typingText').value = item.text;
        updateTypingCharCount();
      }
      if ($('clipPickerSelectedText')) {
        $('clipPickerSelectedText').textContent = truncate(item.text, 36);
      }
      showToast('Loaded saved text into editor.', 'info');
    }
  });

  $('typingSpeedSlider')?.addEventListener('input', (e) => {
    if ($('typingSpeedValue')) $('typingSpeedValue').textContent = e.target.value;
    $$('.preset-btn').forEach((b) => b.classList.remove('active'));
    if ($('speedTag')) $('speedTag').textContent = `${e.target.value} WPM`;
  });

  $('detectFieldsBtn')?.addEventListener('click', detectFields);
  $('startTypingBtn')?.addEventListener('click', startTyping);

  $('pauseTypingBtn')?.addEventListener('click', async () => {
    const tabResult = await sendBG('getActiveTab');
    if (!tabResult || !tabResult.success) return;
    await sendContent(tabResult.tab.id, { action: 'pauseTyping' });
    typingState.paused = true;
    $('pauseTypingBtn').disabled = true;
    $('resumeTypingBtn').disabled = false;
    $('typingStatusBadge').textContent = 'Paused';
    showToast('Typing paused.', 'info');
  });

  $('resumeTypingBtn')?.addEventListener('click', async () => {
    const tabResult = await sendBG('getActiveTab');
    if (!tabResult || !tabResult.success) return;
    await sendContent(tabResult.tab.id, { action: 'resumeTyping' });
    typingState.paused = false;
    $('pauseTypingBtn').disabled = false;
    $('resumeTypingBtn').disabled = true;
    $('typingStatusBadge').textContent = 'Typing…';
    showToast('Typing resumed.', 'info');
  });

  $('stopTypingBtn')?.addEventListener('click', async () => {
    const tabResult = await sendBG('getActiveTab');
    if (!tabResult || !tabResult.success) return;
    await sendContent(tabResult.tab.id, { action: 'stopTyping' });
    typingState.active = false;
    $('pauseTypingBtn').disabled = true;
    $('stopTypingBtn').disabled = true;
    $('resumeTypingBtn').disabled = true;
    $('restartTypingBtn').disabled = false;
    $('typingStatusBadge').textContent = 'Stopped';
    showToast('Typing stopped.', 'warning');
  });

  $('restartTypingBtn')?.addEventListener('click', () => {
    $('typingProgressCard').style.display = 'none';
    if (selectedFieldIndex !== null) {
      $('typingConfirmCard').style.display = 'block';
    }
    typingState.active = false;
  });
}

// Listen for typing progress events from content-script
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'typingProgress') {
    const { status, total, typed } = message;
    const pct = total ? Math.min(100, Math.round((typed / total) * 100)) : 0;
    if ($('typingProgressBar')) $('typingProgressBar').style.width = `${pct}%`;
    if ($('typingProgressPct')) $('typingProgressPct').textContent = `${pct}%`;
    if ($('liveCharsTyped')) $('liveCharsTyped').textContent = typed || 0;
    if ($('liveWordsTyped')) {
      const text = $('typingText')?.value || '';
      const sub = text.substring(0, typed || 0);
      $('liveWordsTyped').textContent = sub.trim().split(/\s+/).filter(Boolean).length;
    }
    if (status && $('typingStatusBadge')) {
      $('typingStatusBadge').textContent = status.charAt(0).toUpperCase() + status.slice(1);
    }
  }
});

// ─── History ──────────────────────────────────────────────────────────────────
async function loadHistory() {
  const activeTab = document.querySelector('.history-tab.active')?.dataset.tab || 'clipboard-history';
  loadHistoryTab(activeTab);
}

async function loadHistoryTab(tab) {
  if (tab === 'clipboard-history') {
    const res = await sendBG('getClipboardHistory', { filters: {} });
    const list = $('historyClipboardList');
    if (!list) return;
    if (!res || !res.success || !res.items.length) {
      list.innerHTML = '<div class="empty-state">No clipboard history items recorded yet.</div>';
      return;
    }
    list.innerHTML = res.items
      .map(
        (item) => `
      <div class="clipboard-item">
        <div class="clipboard-item-header">
          <span class="badge badge--${escapeHtml(item.category)}">${escapeHtml(item.category)}</span>
          <span style="margin-left:auto;font-size:10px;color:var(--text-muted);">${formatDate(item.timestamp)}</span>
        </div>
        <div class="clipboard-item-text">${escapeHtml(item.text)}</div>
        <div class="clipboard-item-actions">
          <button class="clip-btn clip-btn--primary" data-copy-text="${escapeHtml(item.text)}">Copy</button>
          <button class="clip-btn clip-btn--danger" data-del-clip="${escapeHtml(item.id)}">Delete</button>
        </div>
      </div>`
      )
      .join('');

    list.querySelectorAll('[data-copy-text]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await copyToClipboard(btn.dataset.copyText);
        showToast('Copied to clipboard!', 'success');
      });
    });

    list.querySelectorAll('[data-del-clip]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (confirm('Delete this item?')) {
          await sendBG('deleteClipboardItem', { id: btn.dataset.delClip });
          loadHistoryTab('clipboard-history');
          loadDashboard();
        }
      });
    });
  } else if (tab === 'scanned-history') {
    const res = await sendBG('getScannedPages');
    const list = $('historyScannedList');
    if (!list) return;
    if (!res || !res.success || !res.pages.length) {
      list.innerHTML = '<div class="empty-state">No scanned pages saved yet.</div>';
      return;
    }
    list.innerHTML = res.pages
      .map(
        (p) => `
      <div class="clipboard-item">
        <div class="clipboard-item-header">
          <strong style="font-size:12px;">${escapeHtml(truncate(p.title, 45))}</strong>
        </div>
        <div class="clipboard-item-meta">
          <span>${escapeHtml(p.domain || '')}</span>
          <span>·</span>
          <span>${p.wordCount?.toLocaleString() || 0} words</span>
          <span>·</span>
          <span>${formatDate(p.timestamp)}</span>
        </div>
        <div class="clipboard-item-actions">
          <button class="clip-btn clip-btn--danger" data-del-page="${escapeHtml(p.id)}">Delete</button>
        </div>
      </div>`
      )
      .join('');

    list.querySelectorAll('[data-del-page]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (confirm('Delete this saved scan?')) {
          await sendBG('deleteScannedPage', { id: btn.dataset.delPage });
          loadHistoryTab('scanned-history');
          loadDashboard();
        }
      });
    });
  } else if (tab === 'questions-history') {
    const res = await sendBG('getExtractedQuestions', { filters: {} });
    const list = $('historyQuestionsList');
    if (!list) return;
    if (!res || !res.success || !res.questions.length) {
      list.innerHTML = '<div class="empty-state">No extracted questions saved yet.</div>';
      return;
    }
    currentExtractedQuestions = res.questions;
    list.innerHTML = res.questions.slice(0, 50).map((q) => renderQuestionCard(q)).join('');
    attachQuestionCardEvents(list);
  } else if (tab === 'typing-history') {
    const res = await sendBG('getTypingSessions');
    const list = $('historyTypingList');
    if (!list) return;
    if (!res || !res.success || !res.sessions.length) {
      list.innerHTML = '<div class="empty-state">No typing sessions recorded yet.</div>';
      return;
    }
    list.innerHTML = res.sessions
      .map(
        (s) => `
      <div class="clipboard-item">
        <div class="clipboard-item-header">
          <span class="badge">${escapeHtml(s.mode || 'character')}</span>
          <span style="margin-left:auto;font-size:10px;color:var(--text-muted);">${formatDate(s.timestamp)}</span>
        </div>
        <div class="clipboard-item-meta">
          <span>${s.textLength} chars typed</span>
          <span>·</span>
          <span>${s.speed} WPM target</span>
          <span>·</span>
          <span>${s.completed ? 'Completed' : 'Partial'}</span>
        </div>
      </div>`
      )
      .join('');
  }
}

function initHistory() {
  $$('.history-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.history-tab').forEach((t) => t.classList.remove('active'));
      $$('.history-panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      const targetPanel = $(`tab-${tab.dataset.tab}`);
      if (targetPanel) targetPanel.classList.add('active');
      loadHistoryTab(tab.dataset.tab);
    });
  });

  $('exportHistoryBtn')?.addEventListener('click', async () => {
    const res = await sendBG('exportData', { types: ['all'] });
    if (res && res.success) {
      downloadJSON(res.data, `smartpaste-backup-${Date.now()}.json`);
      showToast('All data exported as JSON!', 'success');
    }
  });

  $('clearAllBtn')?.addEventListener('click', async () => {
    if (confirm('Clear all history records? This action cannot be reversed.')) {
      await sendBG('clearAllData');
      showToast('All history cleared.', 'info');
      loadHistory();
      loadDashboard();
    }
  });
}

// ─── Settings ─────────────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const res = await sendBG('getSettings');
    if (res && res.success && res.settings) {
      const s = res.settings;
      if ($('settingTheme')) $('settingTheme').value = s.theme || 'dark';
      if ($('settingMaxItems')) $('settingMaxItems').value = s.maxClipboardItems || 200;
      if ($('settingAutoDetect')) $('settingAutoDetect').checked = s.autoDetectQuestions !== false;
      if ($('settingTypingSpeed')) $('settingTypingSpeed').value = s.typingSpeed || 60;
      if ($('settingTypingMode')) $('settingTypingMode').value = s.typingMode || 'character';
      if ($('settingPauseParagraph')) $('settingPauseParagraph').checked = s.pauseAfterParagraph !== false;

      if (s.apiKeys) {
        if ($('keyChatGPT')) $('keyChatGPT').value = s.apiKeys.chatgpt || '';
        if ($('keyClaude')) $('keyClaude').value = s.apiKeys.claude || '';
        if ($('keyGemini')) $('keyGemini').value = s.apiKeys.gemini || '';
      }
    }

    const usage = await sendBG('getStorageUsage');
    if (usage && usage.success) {
      const pct = Math.min(100, (usage.bytesUsed / usage.bytesTotal) * 100);
      if ($('storageBar')) $('storageBar').style.width = `${pct}%`;
      const kb = Math.round(usage.bytesUsed / 1024);
      const totalKb = Math.round(usage.bytesTotal / 1024);
      if ($('storageLabel')) $('storageLabel').textContent = `${kb} KB of ${totalKb} KB used`;
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

function initSettings() {
  $('saveSettingsBtn')?.addEventListener('click', async () => {
    const newSettings = {
      theme: $('settingTheme')?.value || 'dark',
      maxClipboardItems: parseInt($('settingMaxItems')?.value || 200),
      autoDetectQuestions: $('settingAutoDetect')?.checked === true,
      typingSpeed: parseInt($('settingTypingSpeed')?.value || 60),
      typingMode: $('settingTypingMode')?.value || 'character',
      pauseAfterParagraph: $('settingPauseParagraph')?.checked === true,
      apiKeys: {
        chatgpt: $('keyChatGPT')?.value.trim() || '',
        claude: $('keyClaude')?.value.trim() || '',
        gemini: $('keyGemini')?.value.trim() || ''
      }
    };

    const res = await sendBG('saveSettings', { settings: newSettings });
    if (res && res.success) {
      applyTheme(newSettings.theme);
      showToast('Settings saved successfully!', 'success');
    } else {
      showToast('Failed to save settings.', 'error');
    }
  });

  $('exportDataBtn')?.addEventListener('click', async () => {
    const res = await sendBG('exportData', { types: ['all'] });
    if (res && res.success) {
      downloadJSON(res.data, `smartpaste-data-export-${Date.now()}.json`);
      showToast('Data exported!', 'success');
    }
  });

  $('importDataBtn')?.addEventListener('click', () => {
    $('importFileInput')?.click();
  });

  $('importFileInput')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const content = await file.text();
      const parsed = JSON.parse(content);
      if (!parsed.version) throw new Error('Unrecognized backup format.');
      if (confirm('Import data? This will merge with your existing clipboard and history records.')) {
        const res = await sendBG('importData', { data: parsed });
        if (res && res.success) {
          showToast('Data imported successfully!', 'success');
          loadSettings();
          loadDashboard();
        }
      }
    } catch (err) {
      showToast(`Import failed: ${err.message}`, 'error');
    }
    e.target.value = '';
  });

  $('clearAllDataBtn')?.addEventListener('click', async () => {
    if (confirm('Erase all saved clipboard, scans, questions, and sessions? (Settings preserved)')) {
      await sendBG('clearAllData');
      showToast('All data erased.', 'info');
      loadDashboard();
      loadSettings();
    }
  });
}

// ─── Entry Point ──────────────────────────────────────────────────────────────
async function init() {
  initTheme();
  initNavigation();
  initDashboard();
  initAI();
  initClipboard();
  initPaste();
  initScanner();
  initQuestions();
  initTyping();
  initHistory();
  initSettings();
  await loadDashboard();
}

document.addEventListener('DOMContentLoaded', init);

