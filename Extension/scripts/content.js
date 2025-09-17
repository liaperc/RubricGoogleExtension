(() => {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'GRADEBOOK_LOADED') {
            console.log('yay!');
      
        }
        return true;
    });
})();
