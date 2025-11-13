chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "export_links") {
    const liens = message.links;
    chrome.tabs.create({
      url: `export.html?links=${encodeURIComponent(JSON.stringify(liens))}`
    });
  }
});
