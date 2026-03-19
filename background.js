const BADGE_COLOR = "#006cda";
const TARGET_HOST  = "nicochannel.jp";

function updateBadge(tabId, url) {
  const match = url && url.includes(TARGET_HOST);
  chrome.action.setBadgeText({ text: match ? "ON" : "", tabId });
  if (match) chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR, tabId });
}

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    updateBadge(tabId, tab.url);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url !== undefined) updateBadge(tabId, changeInfo.url);
});

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: "toggle" }).catch(() => {});
});
