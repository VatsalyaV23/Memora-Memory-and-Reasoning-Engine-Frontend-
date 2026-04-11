// Agent Monitor - Real-time activity tracking

let stats = {
  captures: 0,
  decisions: 0,
  questions: 0,
  responseTimes: []
};

let activityLog = [];
let backendUrl = 'http://localhost:8000';

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  startMonitoring();
  setupEventListeners();
  updateTime();
  setInterval(updateTime, 1000);
});

// Load settings
function loadSettings() {
  chrome.storage.sync.get(['backendUrl'], (result) => {
    if (result.backendUrl) {
      backendUrl = result.backendUrl;
    }
  });
}

// Setup event listeners
function setupEventListeners() {
  document.getElementById('clear-btn').addEventListener('click', clearLog);
  document.getElementById('export-btn').addEventListener('click', exportLog);
}

// Update time display
function updateTime() {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour12: false });
  document.getElementById('time-display').textContent = time;
}

// Start monitoring
function startMonitoring() {
  // Listen to messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'log-activity') {
      logActivity(request.data);
    }
  });

  // Periodic backend health check
  setInterval(checkBackendHealth, 5000);

  // Initial health check
  checkBackendHealth();

  // Simulate activity for demo
  simulateActivity();
}

// Log activity
function logActivity(data) {
  const entry = {
    timestamp: new Date(),
    type: data.type,
    action: data.action,
    detail: data.detail,
    status: data.status || 'info',
    duration: data.duration
  };

  activityLog.push(entry);
  displayLogEntry(entry);

  // Update stats
  updateStats(entry);
}

// Display log entry
function displayLogEntry(entry) {
  const logDiv = document.getElementById('activity-log');
  
  const entryHtml = `
    <div class="log-entry log-${entry.status}">
      <div class="log-time">${entry.timestamp.toLocaleTimeString()}</div>
      <div class="log-action">${entry.action}</div>
      <div class="log-detail">${entry.detail}</div>
      ${entry.duration ? `<div class="log-detail">⏱️ ${entry.duration}ms</div>` : ''}
    </div>
  `;

  logDiv.innerHTML = entryHtml + logDiv.innerHTML;

  // Keep only last 100 entries
  const entries = logDiv.querySelectorAll('.log-entry');
  if (entries.length > 100) {
    entries[entries.length - 1].remove();
  }
}

// Update statistics
function updateStats(entry) {
  switch(entry.type) {
    case 'capture':
      stats.captures++;
      document.getElementById('stat-captures').textContent = stats.captures;
      break;
    case 'extract':
      stats.decisions++;
      document.getElementById('stat-decisions').textContent = stats.decisions;
      break;
    case 'ask':
      stats.questions++;
      document.getElementById('stat-questions').textContent = stats.questions;
      break;
  }

  if (entry.duration) {
    stats.responseTimes.push(entry.duration);
    const avgTime = Math.round(
      stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length
    );
    document.getElementById('stat-response').textContent = avgTime;
  }
}

// Check backend health
function checkBackendHealth() {
  fetch(`${backendUrl}/health`)
    .then(r => r.json())
    .then(data => {
      if (data.status === 'ok') {
        document.getElementById('backend-status').innerHTML = '✓ Online';
        document.getElementById('backend-status').style.color = '#28a745';
      } else {
        document.getElementById('backend-status').innerHTML = '⚠ Partial';
        document.getElementById('backend-status').style.color = '#ffc107';
      }
    })
    .catch(() => {
      document.getElementById('backend-status').innerHTML = '✗ Offline';
      document.getElementById('backend-status').style.color = '#dc3545';
    });
}

// Simulate activity (for demo - remove in production)
function simulateActivity() {
  const activities = [
    { type: 'capture', action: 'TEXT CAPTURED', detail: 'Slack message about database choice', status: 'success', duration: 150 },
    { type: 'extract', action: 'DECISION EXTRACTED', detail: 'Found decision: "Use PostgreSQL"', status: 'success', duration: 2400 },
    { type: 'store', action: 'DATABASE WRITE', detail: 'Stored in PostgreSQL', status: 'success', duration: 300 },
    { type: 'ask', action: 'RAG QUERY', detail: 'Question: "What database did we choose?"', status: 'info', duration: 3100 },
    { type: 'search', action: 'VECTOR SEARCH', detail: 'Searched ChromaDB for relevant documents', status: 'success', duration: 450 }
  ];

  // Log an activity every 3-8 seconds for demo
  const randomInterval = () => {
    const delay = Math.random() * 5000 + 3000;
    setTimeout(() => {
      const activity = activities[Math.floor(Math.random() * activities.length)];
      logActivity(activity);
      randomInterval();
    }, delay);
  };

  randomInterval();
}

// Clear log
function clearLog() {
  if (confirm('Clear all activity logs?')) {
    activityLog = [];
    document.getElementById('activity-log').innerHTML = `
      <div class="log-entry log-info">
        <div class="log-time">Log Cleared</div>
        <div class="log-action">RESET</div>
        <div class="log-detail">Activity log has been cleared</div>
      </div>
    `;
  }
}

// Export log
function exportLog() {
  const dataStr = JSON.stringify(activityLog, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `agent-activity-${new Date().toISOString()}.json`;
  link.click();
  
  URL.revokeObjectURL(url);
}