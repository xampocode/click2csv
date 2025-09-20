chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "openCsvViewerLink", title: "Open in CSV Viewer", contexts: ["link"] });
  chrome.contextMenus.create({ id: "openCsvViewerPage", title: "Open page as CSV in Viewer", contexts: ["page"] });
});
chrome.contextMenus.onClicked.addListener((info) => {
  const url = info.menuItemId === "openCsvViewerLink" ? info.linkUrl : info.pageUrl;
  chrome.tabs.create({ url: chrome.runtime.getURL(`viewer.html?src=${encodeURIComponent(url)}`) });
});
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("viewer.html") });
});
