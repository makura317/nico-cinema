function isTargetUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.hostname === "nicochannel.jp") return /\/(video|live)\//.test(u.pathname);
    if (["audee-membership.jp", "sheeta.jp", "qlover.jp"].includes(u.hostname)) return true;
    return false;
  } catch (_) { return false; }
}

function updateBadge(tabId, url) {
  const match = isTargetUrl(url);
  if (match) {
    chrome.action.setBadgeText({ text: "OFF", tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#555", tabId });
  } else {
    chrome.action.setBadgeText({ text: "", tabId });
  }
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
