const BADGE_COLOR = "#006cda";

function isTargetUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.hostname === "nicochannel.jp" && /\/(video|live)\//.test(u.pathname);
  } catch (_) { return false; }
}

function updateBadge(tabId, url) {
  const match = isTargetUrl(url);
  chrome.action.setBadgeText({ text: match ? "ON" : "", tabId });
  if (match) chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR, tabId });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url !== undefined) updateBadge(tabId, changeInfo.url);
  else if (changeInfo.status === "complete" && tab.url) updateBadge(tabId, tab.url);
});

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.action === "cinemaBadge" && sender.tab) {
    const text  = msg.on ? "ON" : "OFF";
    const color = msg.on ? "#006cda" : "#555";
    chrome.action.setBadgeText({ text, tabId: sender.tab.id });
    chrome.action.setBadgeBackgroundColor({ color, tabId: sender.tab.id });
  }
});

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: "toggle" }).catch(() => {});
});
