chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({
    text : "OFF",
  });
  chrome.action.setBadgeBackgroundColor({
    color : "#FF0000"
  });
})

const extensions = 'https://developer.chrome.com/docs/extensions';
const webstore = 'https://developer.chrome.com/docs/webstore';

chrome.action.onClicked.addListener(async (tab) => {
    if (tab.url.startsWith(extensions) || tab.url.startsWith(webstore)) {
        // get the the status of the badge (ON or OFF)
        const prevState = await chrome.action.getBadgeText({tabId: tab.id});
        // update the badge text to the opposite state
        const nextState = prevState === "ON" ? "OFF" : "ON";

        // Set the badge text

        await chrome.action.setBadgeText({
            tabId: tab.id,
            text : nextState,
        });

        await chrome.action.setBadgeBackgroundColor({
            tabId: tab.id,
            color : nextState === "ON" ? "#32d600ff" : "#FF0000",
        });

            if (nextState === "ON") {
      // Insert the CSS file when the user turns the extension on
      await chrome.scripting.insertCSS({
        files: ["focus-mode.css"],
        target: { tabId: tab.id },
      });
    } else if (nextState === "OFF") {
      // Remove the CSS file when the user turns the extension off
      await chrome.scripting.removeCSS({
        files: ["focus-mode.css"],
        target: { tabId: tab.id },
      });
    }
    }

})


