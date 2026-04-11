// ===== CONFIG =====
const BACKEND_URL = localStorage.getItem('backendUrl') || 'http://localhost:8000';
let allDecisions = [];
let currentDecision = null;

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadDecisions();
  setInterval(loadDecisions, 5000); // Auto-refresh every 5s
});

// ===== EVENT LISTENERS =====
function setupEventListeners() {
  document.getElementById('refresh-btn').addEventListener('click', loadDecisions);
  document.getElementById('search-input').addEventListener('input', filterDecisions);
  document.getElementById('status-filter').addEventListener('change', filterDecisions);
  document.getElementById('consensus-filter').addEventListener('change', filterDecisions);
  document.getElementById('start-meeting-btn').addEventListener('click', () => openModal('meeting-modal'));
  document.getElementById('start-meeting-confirm').addEventListener('click', startMeeting);
}

// ===== LOAD DECISIONS =====
async function loadDecisions() {
  try {
    const response = await fetch(`${BACKEND_URL}/graph/decisions?limit=100`);
    if (!response.ok) throw new Error('Failed to load decisions');
    
    const data = await response.json();
    allDecisions = data.decisions;
    
    // Calculate consensus for each decision
    await enrichDecisionsWithConsensus();
    
    displayDecisions(allDecisions);
    document.getElementById('total-decisions').textContent = allDecisions.length;
    
  } catch (error) {
    console.error('Error loading decisions:', error);
    showNotification('Failed to load decisions', 'error');
  }
}

async function enrichDecisionsWithConsensus() {
  for (const decision of allDecisions) {
    try {
      const response = await fetch(`${BACKEND_URL}/graph/decision/${decision.id}/consensus`);
      if (response.ok) {
        const consensusData = await response.json();
        decision.consensus = consensusData;
      }
    } catch (error) {
      decision.consensus = { type: 'unknown', votes: 0, percentage: 0 };
    }
  }
}

// ===== DISPLAY DECISIONS =====
function displayDecisions(decisions) {
  const grid = document.getElementById('decisions-grid');
  
  if (decisions.length === 0) {
    grid.innerHTML = `
      <div class="col-span-2 flex items-center justify-center py-12">
        <div class="text-center">
          <p class="text-[#8b90a0] text-lg">No decisions found</p>
          <p class="text-[#8b90a0] text-sm mt-2">Start a meeting or capture decisions to see them here</p>
        </div>
      </div>
    `;
    return;
  }
  
  grid.innerHTML = decisions.map(decision => `
    <div 
      class="glass-panel rounded-xl p-6 cursor-pointer hover:border-[#00daf3] transition-all hover:shadow-lg hover:shadow-[rgba(0,218,243,0.1)]"
      onclick="openDecisionDetail('${decision.id}')"
    >
      <!-- Header -->
      <div class="flex items-start justify-between mb-4">
        <div class="flex-1">
          <h3 class="text-lg font-bold text-white mb-1">${escapeHtml(decision.title)}</h3>
          <p class="text-[#8b90a0] text-sm">${decision.source || 'Unknown Source'}</p>
        </div>
        <div class="text-right">
          ${getStatusBadge(decision.status)}
        </div>
      </div>

      <!-- Description -->
      <p class="text-[#c1c6d7] text-sm line-clamp-2 mb-4">${escapeHtml(decision.description || 'No description')}</p>

      <!-- Consensus Info -->
      <div class="space-y-2 mb-4 pb-4 border-t border-[rgba(0,218,243,0.1)]">
        <div class="flex items-center justify-between text-sm">
          <span class="text-[#8b90a0]">Consensus</span>
          <span class="font-bold text-[#00daf3]">${decision.consensus?.type || 'Unknown'}</span>
        </div>
        <div class="w-full bg-[rgba(0,218,243,0.1)] rounded-full h-2">
          <div 
            class="bg-gradient-to-r from-[#00daf3] to-[#009fb2] h-2 rounded-full transition-all"
            style="width: ${decision.consensus?.percentage || 0}%"
          ></div>
        </div>
        <div class="flex justify-between text-xs text-[#8b90a0]">
          <span>${decision.consensus?.votes || 0} votes</span>
          <span>${decision.consensus?.percentage || 0}% consensus</span>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex items-center justify-between text-xs text-[#8b90a0]">
        <span>📅 ${new Date(decision.created_at).toLocaleDateString()}</span>
        <span>👤 ${decision.source}</span>
      </div>
    </div>
  `).join('');
}

// ===== DECISION DETAIL =====
async function openDecisionDetail(decisionId) {
  try {
    const response = await fetch(`${BACKEND_URL}/graph/decision/${decisionId}`);
    if (!response.ok) throw new Error('Failed to load decision');
    
    const data = await response.json();
    currentDecision = data.decision;
    
    const modalContent = document.getElementById('modal-content');
    modalContent.innerHTML = `
      <!-- Title & Status -->
      <div class="flex items-start justify-between">
        <div>
          <h2 class="text-2xl font-bold mb-2">${escapeHtml(currentDecision.title)}</h2>
          <div class="flex gap-2">
            ${getStatusBadge(currentDecision.status)}
            <span class="px-3 py-1 bg-[rgba(0,218,243,0.2)] text-[#00daf3] rounded-full text-xs font-semibold">
              Source: ${currentDecision.source}
            </span>
          </div>
        </div>
      </div>

      <!-- Description -->
      <div>
        <h3 class="text-sm font-bold text-[#8b90a0] mb-2">Description</h3>
        <p class="text-[#c1c6d7] leading-relaxed">${escapeHtml(currentDecision.description)}</p>
      </div>

      <!-- Consensus Info -->
      <div class="bg-[rgba(0,218,243,0.05)] border border-[rgba(0,218,243,0.2)] rounded-lg p-4">
        <h3 class="text-sm font-bold text-[#8b90a0] mb-3">Team Consensus</h3>
        <div class="grid grid-cols-3 gap-4">
          <div>
            <p class="text-[#8b90a0] text-xs mb-1">Consensus Type</p>
            <p class="text-xl font-bold text-[#00daf3]">${data.consensus?.type || 'Unknown'}</p>
          </div>
          <div>
            <p class="text-[#8b90a0] text-xs mb-1">Agreement Level</p>
            <p class="text-xl font-bold text-[#10b981]">${data.consensus?.percentage || 0}%</p>
          </div>
          <div>
            <p class="text-[#8b90a0] text-xs mb-1">Total Votes</p>
            <p class="text-xl font-bold text-[#f59e0b]">${data.consensus?.votes || 0}</p>
          </div>
        </div>
      </div>

      <!-- Dependencies -->
      ${data.dependencies && data.dependencies.length > 0 ? `
        <div>
          <h3 class="text-sm font-bold text-[#8b90a0] mb-2">Dependencies</h3>
          <div class="space-y-2">
            ${data.dependencies.map(dep => `
              <div class="flex items-center gap-2 p-2 bg-[rgba(0,218,243,0.05)] rounded">
                <span class="text-[#00daf3]">←</span>
                <span class="text-sm">${escapeHtml(dep.decision.title)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Impacted Decisions -->
      ${data.impacted && data.impacted.length > 0 ? `
        <div>
          <h3 class="text-sm font-bold text-[#8b90a0] mb-2">Impacted Decisions</h3>
          <div class="space-y-2">
            ${data.impacted.map(imp => `
              <div class="flex items-center gap-2 p-2 bg-[rgba(0,218,243,0.05)] rounded">
                <span class="text-[#00daf3]">→</span>
                <span class="text-sm">${escapeHtml(imp.decision.title)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Metadata -->
      <div class="grid grid-cols-2 gap-4 pt-4 border-t border-[rgba(0,218,243,0.1)]">
        <div>
          <p class="text-[#8b90a0] text-xs mb-1">Created</p>
          <p class="text-sm">${new Date(currentDecision.created_at).toLocaleString()}</p>
        </div>
        <div>
          <p class="text-[#8b90a0] text-xs mb-1">Last Updated</p>
          <p class="text-sm">${new Date(currentDecision.updated_at).toLocaleString()}</p>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex gap-3 pt-4">
        <button 
          class="flex-1 py-2.5 bg-[#10b981] text-white rounded-lg font-semibold hover:opacity-90"
          onclick="voteOnDecision('${currentDecision.id}', 'approved')"
        >
          ✓ Approve
        </button>
        <button 
          class="flex-1 py-2.5 bg-[#f59e0b] text-white rounded-lg font-semibold hover:opacity-90"
          onclick="voteOnDecision('${currentDecision.id}', 'pending')"
        >
          ⏳ Pending
        </button>
        <button 
          class="flex-1 py-2.5 bg-[#ef4444] text-white rounded-lg font-semibold hover:opacity-90"
          onclick="voteOnDecision('${currentDecision.id}', 'rejected')"
        >
          ✗ Reject
        </button>
      </div>
    `;
    
    openModal('decision-modal');
  } catch (error) {
    console.error('Error loading decision:', error);
    showNotification('Failed to load decision details', 'error');
  }
}

// ===== VOTING =====
async function voteOnDecision(decisionId, vote) {
  try {
    const response = await fetch(`${BACKEND_URL}/graph/decision/${decisionId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote, votedBy: 'current-user' })
    });
    
    if (!response.ok) throw new Error('Failed to vote');
    
    showNotification('✅ Vote recorded!', 'success');
    closeModal();
    loadDecisions();
  } catch (error) {
    console.error('Error voting:', error);
    showNotification('Failed to record vote', 'error');
  }
}

// ===== MEETING =====
async function startMeeting() {
  const title = document.getElementById('meeting-title').value.trim();
  const participants = document.getElementById('meeting-participants').value.split(',').map(p => p.trim());
  const enableRecording = document.getElementById('enable-recording').checked;
  const autoAgent = document.getElementById('auto-agent').checked;
  
  if (!title) {
    showNotification('Please enter a meeting title', 'error');
    return;
  }
  
  try {
    const response = await fetch(`${BACKEND_URL}/meetings/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        participants,
        enableRecording,
        deployAgent: autoAgent
      })
    });
    
    if (!response.ok) throw new Error('Failed to start meeting');
    
    const data = await response.json();
    showNotification(`✅ Meeting started! Meeting ID: ${data.meeting_id}`, 'success');
    closeModal();
    
    if (autoAgent) {
      deployMeetingAgent(data.meeting_id);
    }
  } catch (error) {
    console.error('Error starting meeting:', error);
    showNotification('Failed to start meeting', 'error');
  }
}

async function deployMeetingAgent(meetingId) {
  try {
    const response = await fetch(`${BACKEND_URL}/agent/deploy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meeting_id: meetingId })
    });
    
    if (response.ok) {
      showNotification('🤖 AI Agent deployed to meeting', 'success');
    }
  } catch (error) {
    console.error('Error deploying agent:', error);
  }
}

// ===== FILTERING =====
function filterDecisions() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const status = document.getElementById('status-filter').value;
  const consensus = document.getElementById('consensus-filter').value;
  
  const filtered = allDecisions.filter(d => {
    const matchesSearch = d.title.toLowerCase().includes(search) || 
                         (d.description || '').toLowerCase().includes(search);
    const matchesStatus = !status || d.status === status;
    const matchesConsensus = !consensus || d.consensus?.type === consensus;
    
    return matchesSearch && matchesStatus && matchesConsensus;
  });
  
  displayDecisions(filtered);
}

// ===== MODAL MANAGEMENT =====
function openModal(modalId) {
  document.getElementById(modalId).classList.remove('hidden');
}

function closeModal() {
  document.querySelectorAll('[id$="-modal"]').forEach(m => m.classList.add('hidden'));
}

// ===== UTILITY FUNCTIONS =====
function getStatusBadge(status) {
  const colors = {
    'approved': { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981' },
    'rejected': { bg: 'rgba(239, 68, 68, 0.2)', text: '#ef4444' },
    'pending': { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b' },
    'decided': { bg: 'rgba(0, 218, 243, 0.2)', text: '#00daf3' }
  };
  const color = colors[status] || colors.decided;
  
  return `
    <span 
      class="px-3 py-1 rounded-full text-xs font-bold"
      style="background: ${color.bg}; color: ${color.text};"
    >
      ${status.toUpperCase()}
    </span>
  `;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showNotification(message, type = 'info') {
  // Simple notification - you can enhance with a toast library
  console.log(`[${type.toUpperCase()}] ${message}`);
  alert(message); // Replace with toast notification
}

// Close modal on outside click
document.addEventListener('click', (e) => {
  if (e.target.id?.endsWith('-modal')) {
    closeModal();
  }
});