// ===== ENHANCED POPUP WITH OFFLINE SUPPORT =====

const DEFAULT_BACKEND_URL = 'http://localhost:8000';
let capturedText = '';
let backendUrl = DEFAULT_BACKEND_URL;
let offlineMode = false;

// ===== COMPREHENSIVE PROFESSIONAL Q&A DATABASE =====
const MOCK_DATA = {
  decisions: [
    {
      id: 'dec_00001',
      title: 'Migrate to PostgreSQL',
      status: 'approved',
      description: 'PostgreSQL selected for ACID compliance and complex queries',
      source: 'Engineering Meeting - Q4 2024',
      confidence: 0.95,
      date: '2024-10-15'
    },
    {
      id: 'dec_00002',
      title: 'Adopt FastAPI Framework',
      status: 'approved',
      description: 'FastAPI chosen for async support and auto documentation',
      source: 'Tech Stack Discussion',
      confidence: 0.90,
      date: '2024-10-12'
    },
    {
      id: 'dec_00003',
      title: 'Implement Microservices Architecture',
      status: 'decided',
      description: 'Break down monolith into independent microservices',
      source: 'Architecture Review',
      confidence: 0.85,
      date: '2024-10-10'
    },
    {
      id: 'dec_00004',
      title: 'Use ChromaDB for Vector Search',
      status: 'approved',
      description: 'ChromaDB for semantic search in knowledge base',
      source: 'Database Selection',
      confidence: 0.88,
      date: '2024-10-08'
    },
    {
      id: 'dec_00005',
      title: 'Implement Redis Caching',
      status: 'approved',
      description: 'Redis for distributed caching layer',
      source: 'Performance Optimization',
      confidence: 0.92,
      date: '2024-10-05'
    }
  ],

  qaAnswers: {
    // Normalize keys: lowercase for matching
    'what database did we choose': `PostgreSQL. Chosen for ACID compliance, data integrity, complex query support, and JSON handling. Outperformed MongoDB (eventual consistency risk) and MySQL (limited extensibility). Production deployment: master-replica replication with 5 read replicas.`,
    
    'why postgresql over mongodb': `MongoDB sacrifices consistency for scalability (eventual consistency model). We need stronger data integrity guarantees for financial and operational data. PostgreSQL's ACID properties were non-negotiable for our use case.`,
    
    'what backend framework are we using': `FastAPI. Selected for async/await support, auto-generated API docs (Swagger/ReDoc), type safety with Pydantic validation, and sub-100ms response times. Python-based for ML/AI alignment. Performance comparable to Go/Node.js.`,
    
    'why fastapi and not django or flask': `FastAPI provides async-first design (we need concurrent request handling). Django is over-engineered for microservices. Flask requires extensive third-party libraries. FastAPI offers perfect balance of simplicity and functionality.`,
    
    'how are we handling database scaling': `Master-replica replication for read scaling (up to 5 replicas). Connection pooling with PgBouncer. Time-based partitioning for historical data. User-based sharding planned for 2026 when 50M+ records expected.`,
    
    'what about nosql databases': `Evaluated MongoDB, DynamoDB, and Cassandra. Ruled out due to eventual consistency model conflicting with our data integrity requirements. PostgreSQL with proper optimization satisfies our needs.`,
    
    'what architecture are we building': `Microservices. 7 independent services: User, Data Capture, Decision Extraction, Knowledge Store, Query, Notification, Analytics. Each service owns its database and scales independently. Replaces monolith by Q3 2025.`,
    
    'why microservices over monolith': `Independent scaling, parallel deployments (10-15/day vs 2-3/week), technology flexibility per team, faster development velocity, fault isolation.`,
    
    'what are the microservices': `1) User Service (auth) 2) Data Capture (ingestion) 3) Decision Extraction (AI) 4) Knowledge Store (ChromaDB) 5) Query Service (RAG) 6) Notification (email/Slack) 7) Analytics (metrics/trends).`,
    
    'how do services communicate': `Synchronous: REST APIs for queries. Asynchronous: RabbitMQ/Kafka message queues for event-driven workflows. Service discovery through Kubernetes DNS. Mutual TLS for service-to-service auth.`,
    
    'default': `I'm not sure about that specific question. Try asking about: databases, frameworks, architecture, caching, AI/LLM, scaling, security, testing, deployment, monitoring, compliance, pricing, integrations, or roadmap.`
  },

  // ✅ ADD SOURCES ARRAY
  sources: [
    {
      title: 'Q4 2024 Engineering Meeting',
      source: 'Meeting Notes',
      relevance: 0.95,
      text_preview: 'Database selection was discussed with consideration for ACID compliance and scalability requirements.'
    },
    {
      title: 'Tech Stack Documentation',
      source: 'Internal Wiki',
      relevance: 0.88,
      text_preview: 'FastAPI was chosen for its async capabilities and automatic API documentation generation.'
    },
    {
      title: 'Architecture Decision Record',
      source: 'ADR #001',
      relevance: 0.92,
      text_preview: 'Microservices architecture enables independent scaling and deployment of services.'
    }
  ]
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await checkBackendHealth(); // ✅ Check backend on load
  setupTabs();
  setupEventListeners();
});

// ===== SETTINGS MANAGEMENT =====
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['backendUrl', 'capturedText', 'capturedData'], (items) => {
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${backendUrl}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      offlineMode = false;
      showStatus('settings-status', 
        `✅ Connected! PostgreSQL: ${data.postgres}, ChromaDB: ${data.chromadb}`,
        'success'
      );
      document.getElementById('backend-status-info').textContent = '✓ Connected';
    } else {
      offlineMode = true;
      showStatus('settings-status', 'Using offline mode with demo data', 'warning');
    }
  } catch (error) {
    offlineMode = true;
    showStatus('settings-status', 
      `⚠️ Backend offline - using demo data`,
      'warning'
    );
    document.getElementById('backend-status-info').textContent = '✗ Offline (Demo Mode)';
  }
}

async function checkBackendHealth() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(`${backendUrl}/health`, { 
      signal: controller.signal 
    });
    clearTimeout(timeoutId);
    
    if (response.ok) {
      offlineMode = false;
      document.getElementById('backend-status-info').textContent = '✓ Connected';
    } else {
      offlineMode = true;
      document.getElementById('backend-status-info').textContent = '✗ Offline (Demo)';
    }
  } catch (error) {
    offlineMode = true;
    document.getElementById('backend-status-info').textContent = '✗ Offline (Demo)';
  }
}

// ===== TAB MANAGEMENT =====
function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tabName = btn.dataset.tab;
      tabContents.forEach(tab => tab.classList.remove('active'));
      tabBtns.forEach(b => b.classList.remove('active'));
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
    let docId = `doc_${Date.now()}`;
    
    // Try backend first
    if (!offlineMode) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await fetch(`${backendUrl}/capture`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: text,
            source: source,
            url: url || 'chrome-extension://local'
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          docId = data.id;
        } else {
          throw new Error('Backend capture failed');
        }
      } catch (backendError) {
        console.log('Backend failed, using offline mode:', backendError.message);
        offlineMode = true;
      }
    }
    
    // Store captured data locally
    capturedText = text;
    const capturedData = {
      id: docId,
      text: text,
      source: source,
      url: url,
      capturedAt: new Date().toISOString(),
      status: 'captured'
    };
    
    chrome.storage.sync.set({ 
      capturedText: text,
      capturedData: capturedData
    });
    
    updateCapturePreview();
    showStatus('capture-status', 
      `✅ Captured ${text.length} characters (ID: ${docId}) ${offlineMode ? '(Demo Mode)' : ''}`,
      'success'
    );
    
  } catch (error) {
    console.error('Capture error:', error);
    showStatus('capture-status', `❌ Error: ${error.message}`, 'error');
  }
}

function updateCapturePreview() {
  let previewEl = document.getElementById('capture-preview');
  if (!previewEl) {
    previewEl = document.createElement('div');
    previewEl.id = 'capture-preview';
    previewEl.className = 'text-preview';
    document.querySelector('#capture').appendChild(previewEl);
  }
  
  if (capturedText) {
    const preview = capturedText.substring(0, 200) + (capturedText.length > 200 ? '...' : '');
    previewEl.innerHTML = `<strong>📄 Preview:</strong><br>${escapeHtml(preview)}`;
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
    let decisions = [];
    
    // Try backend first
    if (!offlineMode) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(`${backendUrl}/extract-decisions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: capturedText,
            source: source,
            url: document.getElementById('capture-url').value || 'chrome-extension://local',
            auto_store: true
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          decisions = data.decisions;
        } else {
          throw new Error('Backend extraction failed');
        }
      } catch (backendError) {
        console.log('Backend failed, using demo data:', backendError.message);
        offlineMode = true;
      }
    }
    
    // Use mock data if offline or backend failed
    if (decisions.length === 0) {
      decisions = MOCK_DATA.decisions.slice(0, 3);
    }
    
    displayDecisions(decisions);
    showStatus('extract-status', 
      `✅ Extracted ${decisions.length} decisions! ${offlineMode ? '(Demo Data)' : ''}`,
      'success'
    );
    
    chrome.storage.sync.set({ lastExtractedDecisions: decisions });
    
  } catch (error) {
    console.error('Extraction error:', error);
    // Show mock data on error
    displayDecisions(MOCK_DATA.decisions.slice(0, 3));
    showStatus('extract-status', `✅ Showing demo decisions (offline)`, 'info');
  }
}

function displayDecisions(decisions) {
  const resultsEl = document.getElementById('extract-results');
  
  resultsEl.innerHTML = decisions.map((dec, i) => `
    <div class="result-item">
      <div class="result-title">
        <span style="color: #00daf3;">✓</span> ${i + 1}. ${escapeHtml(dec.title || 'Untitled')}
      </div>
      <div class="result-meta">
        <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981;">
          ${(dec.status || 'decided').toUpperCase()}
        </span>
        <span class="badge">
          Confidence: ${(dec.confidence ? (dec.confidence * 100).toFixed(0) : 85)}%
        </span>
      </div>
      ${dec.description ? `
        <p style="margin-top: 8px; color: #8b90a0; font-size: 10px; line-height: 1.4;">
          ${escapeHtml(dec.description)}
        </p>
      ` : ''}
      ${dec.source ? `
        <p style="margin-top: 6px; color: #667eea; font-size: 9px;">
          📍 ${escapeHtml(dec.source)}
        </p>
      ` : ''}
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
    let answer = '';
    let citations = [];
    
    // Try backend first
    if (!offlineMode) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(`${backendUrl}/ask`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          answer = data.answer;
          citations = data.citations || [];
        } else {
          throw new Error('Backend answer failed');
        }
      } catch (backendError) {
        console.log('Backend failed, using demo data:', backendError.message);
        offlineMode = true;
      }
    }
    
    // ✅ Use mock data if offline or backend failed
    if (!answer) {
      // Normalize question to lowercase for matching
      const normalizedQuestion = question.toLowerCase();
      
      // Try to find matching answer
      answer = Object.keys(MOCK_DATA.qaAnswers).find(key => 
        normalizedQuestion.includes(key.toLowerCase()) || 
        key.toLowerCase().includes(normalizedQuestion)
      )
        ? MOCK_DATA.qaAnswers[Object.keys(MOCK_DATA.qaAnswers).find(key => 
            normalizedQuestion.includes(key.toLowerCase()) || 
            key.toLowerCase().includes(normalizedQuestion)
          )]
        : MOCK_DATA.qaAnswers.default;
      
      citations = MOCK_DATA.sources;
    }
    
    displayAnswer(answer, citations);
    showStatus('ask-status', 
      `✅ Answer generated ${offlineMode ? '(Demo Data)' : ''}`,
      'success'
    );
    
  } catch (error) {
    console.error('Ask error:', error);
    const answer = MOCK_DATA.qaAnswers.default;
    displayAnswer(answer, MOCK_DATA.sources);
    showStatus('ask-status', `✅ Showing demo answer (offline)`, 'info');
  }
}

function displayAnswer(answer, citations) {
  const resultsEl = document.getElementById('ask-results');
  
  let html = `
    <div class="result-item" style="border-left: 4px solid #00daf3; background: rgba(0, 218, 243, 0.05);">
      <div style="font-weight: 600; margin-bottom: 8px; color: #dae2fd; font-size: 12px;">
        💭 Answer:
      </div>
      <p style="line-height: 1.6; margin-bottom: 12px; font-size: 11px; color: #c1c6d7;">
        ${escapeHtml(answer)}
      </p>
  `;
  
  if (citations && Array.isArray(citations) && citations.length > 0) {
    html += `
      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(0, 218, 243, 0.2);">
        <div style="font-weight: 600; margin-bottom: 8px; font-size: 10px; color: #8b90a0; text-transform: uppercase;">
          📚 Sources:
        </div>
    `;
    
    citations.forEach((cit, i) => {
      const relevance = cit.relevance ? (cit.relevance * 100).toFixed(0) : 90;
      const source = cit.source || cit.title || 'Unknown Source';
      const preview = cit.text_preview || cit.text || 'No preview available';
      
      html += `
        <div style="font-size: 10px; color: #8b90a0; margin-bottom: 8px; padding: 8px; background: rgba(0, 218, 243, 0.05); border-radius: 4px; border-left: 2px solid #00daf3;">
          <strong>[${i + 1}] ${escapeHtml(source)}</strong><br>
          <span style="color: #00daf3; font-weight: 600;">↳ ${relevance}% relevant</span><br>
          <em style="font-size: 9px; color: #667eea;">"${escapeHtml(preview.substring(0, 120))}..."</em>
        </div>
      `;
    });
    
    html += `</div>`;
  }
  
  html += `</div>`;
  resultsEl.innerHTML = html;
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

function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}