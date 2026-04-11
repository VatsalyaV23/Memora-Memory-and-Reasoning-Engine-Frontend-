// ===== CONFIGURATION =====
const DEFAULT_BACKEND_URL = 'http://localhost:8000';
let capturedText = '';
let backendUrl = DEFAULT_BACKEND_URL;
let capturedDocId = '';

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupTabs();
  setupEventListeners();
  checkBackendHealth();
});

// ===== SETTINGS MANAGEMENT =====
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['backendUrl', 'capturedText'], (items) => {
      if (items.backendUrl) {
        backendUrl = items.backendUrl;
        document.getElementById('backend-url').value = backendUrl;
      }
      if (items.capturedText) {
        capturedText = items.capturedText;
        updateCapturePreview();
      }
      resolve();
    });
  });
}

function saveSettings() {
  const url = document.getElementById('backend-url').value.trim();
  
  if (!url) {
    showStatus('settings-status', 'Please enter a backend URL', 'error');
    return;
  }
  
  if (!url.startsWith('http')) {
    showStatus('settings-status', 'URL must start with http:// or https://', 'error');
    return;
  }
  
  backendUrl = url;
  chrome.storage.sync.set({ backendUrl: url }, () => {
    showStatus('settings-status', '✅ Settings saved successfully!', 'success');
    setTimeout(() => checkBackendHealth(), 500);
  });
}

async function testConnection() {
  showStatus('settings-status', 'Testing connection...', 'loading');
  
  try {
    const response = await fetch(`${backendUrl}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
      const data = await response.json();
      showStatus('settings-status', 
        `✅ Connected! PostgreSQL: ${data.postgres}, ChromaDB: ${data.chromadb}`,
        'success'
      );
      document.getElementById('backend-status-info').textContent = '✓ Connected';
    } else {
      showStatus('settings-status', `❌ Server error: ${response.status}`, 'error');
    }
  } catch (error) {
    showStatus('settings-status', `❌ Connection failed: ${error.message}`, 'error');
    document.getElementById('backend-status-info').textContent = '✗ Disconnected';
  }
}

async function checkBackendHealth() {
  try {
    const response = await fetch(`${backendUrl}/health`);
    if (response.ok) {
      document.getElementById('backend-status-info').textContent = '✓ Connected';
    } else {
      document.getElementById('backend-status-info').textContent = '✗ Error';
    }
  } catch (error) {
    document.getElementById('backend-status-info').textContent = '✗ Offline';
  }
}

// ===== TAB MANAGEMENT =====
function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabName = btn.dataset.tab;
      
      // Deactivate all
      tabContents.forEach(tab => tab.classList.remove('active'));
      tabBtns.forEach(b => b.classList.remove('active'));
      
      // Activate selected
      document.getElementById(tabName)?.classList.add('active');
      btn.classList.add('active');
    });
  });
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
  document.getElementById('capture-btn').addEventListener('click', captureText);
  document.getElementById('extract-btn').addEventListener('click', extractDecisions);
  document.getElementById('ask-btn').addEventListener('click', askQuestion);
  document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
  document.getElementById('test-connection-btn').addEventListener('click', testConnection);
  document.getElementById('open-monitor').addEventListener('click', openMonitor);
}

// ===== CAPTURE FUNCTIONALITY =====
async function captureText() {
  const text = document.getElementById('capture-text').value.trim();
  
  if (!text) {
    showStatus('capture-status', 'Please paste some text first', 'error');
    return;
  }
  
  showStatus('capture-status', 'Capturing text...', 'loading');
  
  try {
    const source = document.getElementById('capture-source').value;
    const url = document.getElementById('capture-url').value;
    
    const response = await fetch(`${backendUrl}/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text,
        source: source,
        url: url || 'chrome-extension://local'
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Capture failed');
    }
    
    const data = await response.json();
    capturedText = text;
    capturedDocId = data.id;
    
    chrome.storage.sync.set({ capturedText: text });
    updateCapturePreview();
    
    showStatus('capture-status', 
      `✅ Captured ${text.length} characters (ID: ${data.id})`,
      'success'
    );
    
  } catch (error) {
    showStatus('capture-status', `❌ Error: ${error.message}`, 'error');
  }
}

function updateCapturePreview() {
  const preview = document.querySelector('.text-preview');
  if (capturedText) {
    const previewHtml = `<strong>Preview:</strong><br>${capturedText.substring(0, 200)}${capturedText.length > 200 ? '...' : ''}`;
    
    let previewEl = document.getElementById('capture-preview');
    if (!previewEl) {
      previewEl = document.createElement('div');
      previewEl.id = 'capture-preview';
      previewEl.className = 'text-preview';
      document.querySelector('#capture').appendChild(previewEl);
    }
    previewEl.innerHTML = previewHtml;
  }
}

// ===== EXTRACTION FUNCTIONALITY =====
async function extractDecisions() {
  if (!capturedText) {
    showStatus('extract-status', '❌ No text captured. Go to Capture tab first!', 'error');
    return;
  }
  
  showStatus('extract-status', 'Extracting decisions...', 'loading');
  
  try {
    const source = document.getElementById('capture-source').value;
    
    const response = await fetch(`${backendUrl}/extract-decisions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: capturedText,
        source: source,
        url: document.getElementById('capture-url').value || 'chrome-extension://local',
        auto_store: true
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Extraction failed');
    }
    
    const data = await response.json();
    
    if (data.decisions.length === 0) {
      showStatus('extract-status', 'ℹ️ No decisions found in the text', 'info');
      return;
    }
    
    displayDecisions(data.decisions);
    showStatus('extract-status', 
      `✅ Extracted ${data.count} decisions!`,
      'success'
    );
    
    chrome.storage.sync.set({ 
      lastExtractedDecisions: data.decisions
    });
    
  } catch (error) {
    showStatus('extract-status', `❌ Error: ${error.message}`, 'error');
  }
}

function displayDecisions(decisions) {
  const resultsEl = document.getElementById('extract-results');
  
  resultsEl.innerHTML = decisions.map((dec, i) => `
    <div class="result-item">
      <div class="result-title">${i + 1}. ${dec.title}</div>
      <div class="result-meta">
        <span class="badge">${dec.status.toUpperCase()}</span>
        <span class="badge">Confidence: ${(dec.confidence * 100).toFixed(0)}%</span>
      </div>
      ${dec.description ? `<p style="margin-top: 6px; color: #8b90a0;">${dec.description}</p>` : ''}
    </div>
  `).join('');
}

// ===== QUESTION ANSWERING =====
async function askQuestion() {
  const question = document.getElementById('ask-question').value.trim();
  
  if (!question) {
    showStatus('ask-status', 'Please enter a question', 'error');
    return;
  }
  
  showStatus('ask-status', 'Getting answer...', 'loading');
  
  try {
    const response = await fetch(`${backendUrl}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Question failed');
    }
    
    const data = await response.json();
    
    const resultsEl = document.getElementById('ask-results');
    let html = `
      <div class="result-item" style="border-left: 4px solid #00daf3; background: rgba(0, 218, 243, 0.05);">
        <div style="font-weight: 600; margin-bottom: 8px; color: #dae2fd;">Answer:</div>
        <p style="line-height: 1.6; margin-bottom: 12px;">${data.answer}</p>
    `;
    
    if (data.citations && data.citations.length > 0) {
      html += `<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(0, 218, 243, 0.2);">
        <div style="font-weight: 600; margin-bottom: 8px; font-size: 10px; color: #8b90a0;">Sources:</div>`;
      
      data.citations.forEach((cit, i) => {
        html += `
          <div style="font-size: 10px; color: #8b90a0; margin-bottom: 6px;">
            <strong>[${i + 1}] ${cit.source}</strong> (${(cit.relevance * 100).toFixed(0)}% relevant)<br>
            <em>${cit.text_preview.substring(0, 150)}...</em>
          </div>
        `;
      });
      html += `</div>`;
    }
    html += `</div>`;
    
    resultsEl.innerHTML = html;
    showStatus('ask-status', `✅ Answer generated with ${data.citations.length} sources`, 'success');
    
  } catch (error) {
    showStatus('ask-status', `❌ Error: ${error.message}`, 'error');
  }
}

// ===== UTILITY FUNCTIONS =====
function showStatus(elementId, message, type) {
  const el = document.getElementById(elementId);
  
  if (type === 'loading') {
    el.innerHTML = `<div class="status-box show status-loading"><span class="spinner"></span>${message}</div>`;
  } else {
    el.innerHTML = `<div class="status-box show status-${type}">${message}</div>`;
  }
}

function openMonitor() {
  chrome.windows.create({
    url: `${backendUrl}/docs`,
    type: 'popup',
    width: 1200,
    height: 800
  });
}