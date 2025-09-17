//TODO : download libraries instead of importing
(() => {
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' && tab.url && tab.url.includes('instructure.com') && tab.url.includes('gradebook')) {
            chrome.tabs.sendMessage(tabId, {type: 'GRADEBOOK_LOADED'});
        }
    });
})();


