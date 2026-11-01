'use strict';

const $ = (id) => document.getElementById(id);

let toastTimer = null;
function showToast(msg, type = 'info') {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast toast--${type}`;
  el.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.style.display = 'none';
  }, 2600);
}

function sendBG(action, data = {}) {
  return chrome.runtime.sendMessage({ action, ...data });
}

async function loadSettings() {
  try {
    const res = await sendBG('getSettings');
    if (!res || !res.success || !res.settings) return;
    const s = res.settings;

    const theme = s.theme || 'dark';
    $('theme').value = theme;
    document.documentElement.setAttribute('data-theme', theme);

    $('maxItems').value = s.maxClipboardItems || 200;
    $('autoDetect').checked = s.autoDetectQuestions !== false;
    $('showNotifications').checked = s.showNotifications !== false;

    $('typingSpeed').value = s.typingSpeed || 60;
    $('typingMode').value = s.typingMode || 'character';
    $('minDelay').value = s.minDelay || 30;
    $('maxDelay').value = s.maxDelay || 120;
    $('fixedSpeed').checked = s.fixedSpeed === true;
    $('pauseAfterParagraph').checked = s.pauseAfterParagraph !== false;
    $('pauseDuration').value = s.pauseDuration || 500;

    const usageRes = await sendBG('getStorageUsage');
    if (usageRes && usageRes.success) {
      const pct = Math.min(100, (usageRes.bytesUsed / usageRes.bytesTotal) * 100);
      $('storageBar').style.width = `${pct}%`;
      const kb = Math.round(usageRes.bytesUsed / 1024);
      const totalKb = Math.round(usageRes.bytesTotal / 1024);
      $('storageLabel').textContent = `${kb} KB of ${totalKb} KB local quota used (${pct.toFixed(1)}%)`;
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

$('theme').addEventListener('change', () => {
  const t = $('theme').value;
  document.documentElement.setAttribute('data-theme', t);
});

$('saveBtn').addEventListener('click', async () => {
  const settings = {
    theme: $('theme').value,
    maxClipboardItems: parseInt($('maxItems').value) || 200,
    autoDetectQuestions: $('autoDetect').checked === true,
    showNotifications: $('showNotifications').checked === true,
    typingSpeed: parseInt($('typingSpeed').value) || 60,
    typingMode: $('typingMode').value,
    minDelay: parseInt($('minDelay').value) || 30,
    maxDelay: parseInt($('maxDelay').value) || 120,
    fixedSpeed: $('fixedSpeed').checked === true,
    pauseAfterParagraph: $('pauseAfterParagraph').checked === true,
    pauseDuration: parseInt($('pauseDuration').value) || 500
  };

  const res = await sendBG('saveSettings', { settings });
  if (res && res.success) {
    showToast('Configuration saved successfully!', 'success');
  } else {
    showToast('Failed to save settings.', 'error');
  }
});

$('exportBtn').addEventListener('click', async () => {
  const res = await sendBG('exportData', { types: ['all'] });
  if (res && res.success) {
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartpaste-pro-backup-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Complete backup exported!', 'success');
  }
});

$('importBtn').addEventListener('click', () => $('importFile').click());

$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.version) throw new Error('Unrecognized backup format.');
    if (confirm('Import backup data? This will merge with your current storage records.')) {
      const res = await sendBG('importData', { data });
      if (res && res.success) {
        showToast('Backup restored successfully!', 'success');
        loadSettings();
      }
    }
  } catch (err) {
    showToast(`Restore failed: ${err.message}`, 'error');
  }
  e.target.value = '';
});

$('clearBtn').addEventListener('click', async () => {
  if (confirm('Erase all saved clipboard, scans, questions, and sessions? (Settings preserved)')) {
    await sendBG('clearAllData');
    showToast('All stored records cleared.', 'info');
    loadSettings();
  }
});

document.addEventListener('DOMContentLoaded', loadSettings);

