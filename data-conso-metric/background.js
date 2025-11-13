chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveTabData') {
    // ✅ sender.tab.id = l'ID de l'onglet AUTOMATIQUE
    const tabId = sender.tab?.id;
    
    if (!tabId) {
      sendResponse({ status: 'no-tab-id' });
      return true;
    }

    const key = `tabData_${tabId}`;
    chrome.storage.local.set({
      [key]: request.data
    });
    
    console.log(`✅ Données sauvegardées pour onglet ${tabId}: ${request.data.title}`);
    sendResponse({ status: 'saved' });
  }
  return true;
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateTabData' && sender.tab?.id) {
    const key = `tabData_${sender.tab.id}`;
    chrome.storage.local.set({ [key]: request.data });
    sendResponse({ status: 'updated' });
  }
  return true;
});