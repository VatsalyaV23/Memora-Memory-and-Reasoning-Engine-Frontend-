// Service Worker for Org Memory Engine

// Initialize on extension load
chrome.runtime.onInstalled.addListener(() => {
  console.log('Org Memory Engine extension installed');
  
  // Set default settings
  chrome.storage.sync.get('backendUrl', (items) => {
    if (!items.backendUrl) {
      chrome.storage.sync.set({ 
        backendUrl: 'http://localhost:8000',
        capturedText: ''
      });
    }
  });
});

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSelectedText') {
    // Get selected text from page
    chrome.tabs.executeScript(sender.tab.id, {
      code: 'window.getSelection().toString();'
    }, (result) => {
      sendResponse({ selectedText: result[0] });
    });
    return true; // Will respond asynchronously
  }
});

// Context menu: Add "Capture with Org Memory" option
chrome.contextMenus.create({
  id: 'captureWithOrgMemory',
  title: 'Capture with Org Memory Engine',
  contexts: ['selection']
}, () => {
  if (chrome.runtime.lastError) {
    console.log('Context menu creation skipped (expected on some systems)');
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'captureWithOrgMemory') {
    // Open popup with selected text
    chrome.storage.sync.set({ 
      capturedText: info.selectionText,
      lastTab: {
        url: tab.url,
        title: tab.title
      }
    }, () => {
      chrome.action.openPopup();
    });
  }
});
