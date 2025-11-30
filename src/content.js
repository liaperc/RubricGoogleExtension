import * as utils from './utils.js';
(() => {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'GRADEBOOK_LOADED') {
            utils.addButton();
        }
    });


    
})();