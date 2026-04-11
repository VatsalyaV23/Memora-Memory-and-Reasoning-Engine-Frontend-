// Content script for Org Memory Engine
// Injected into pages to capture selected text

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSelectedText') {
    const selectedText = window.getSelection().toString();
    sendResponse({ selectedText });
  }
});

// Inject button into page for easy capture (optional enhancement)
document.addEventListener('mouseup', () => {
  const selection = window.getSelection().toString();
  if (selection.length > 10) {
    // Could show a small popup here for quick capture
    // For now, users will use the extension icon
  }
});

console.log('Org Memory Engine content script loaded');


// Content script - injected into webpages

console.log('Org Memory Engine content script loaded');

// Listen for text selection
document.addEventListener('mouseup', () => {
  const selectedText = window.getSelection().toString().trim();
  if (selectedText.length > 10) {
    // Send message to popup that text is selected
    chrome.runtime.sendMessage({
      action: 'text-selected',
      text: selectedText,
      url: window.location.href
    });
  }
});

// Handle context menu
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'get-selected-text') {
    const text = window.getSelection().toString();
    sendResponse({ text: text });
  }
});