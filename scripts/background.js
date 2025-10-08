// Background script for Canvas Rubric Extension

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('instructure.com') && tab.url.includes('gradebook')) {
        chrome.tabs.sendMessage(tabId, {type: 'GRADEBOOK_LOADED'});
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'fetchCSV') {
        console.log("Background script: Fetching CSV from", request.url);
        
        fetch(request.url)
            .then(response => {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status + ': ' + response.statusText);
                }
                return response.text();
            })
            .then(data => {
                console.log("Background script: CSV fetched successfully, length:", data.length);
                sendResponse({
                    success: true,
                    data: data
                });
            })
            .catch(error => {
                console.error("Background script: Error fetching CSV:", error);
                sendResponse({
                    success: false,
                    error: error.message
                });
            });
        
        return true;
    }
    if (request.type === "COPY_SPREADSHEET") {
        console.log("Starting spreadsheet copy...");
        copySpreadsheet(request.spreadsheetId, request.newName)
            .then(newUrl => {
                console.log("Copy successful:", newUrl);
                sendResponse({ success: true, url: newUrl });
            })
            .catch(error => {
                console.error("Copy failed:", error);
                sendResponse({ success: false, error: error.message });
            });
        
        return true;
    }
    if (request.type === "sortData"){
        sortData(request.data).then(studentDictionary => {
            sendResponse({ success: true, data: studentDictionary });
        }).catch(error => {
            console.error("Sorting failed:", error);
            sendResponse({ success: false, error: error.message });
        });
        return true;
        
    }
});
const sortData = async (data) => {
    const dataArray = data.split('\n').map(line => line.split(','));
    const standards = dataArray[0].slice(4)
    console.log(standards)
    for (let i = 0; i < dataArray.len; i++){


    }
    const studentDictionary = {};


    return studentDictionary;
}
const copySpreadsheet = async (spreadsheetId, newName) => {
    console.log("AHHHH");
    try {
        console.log("Getting auth token...");
        console.log("Spreadsheet ID:", spreadsheetId);
        console.log("New name:", newName);
        
        // Get auth token
        const token = await new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(token);
                }
            });
        });
        
        console.log("Token received, length:", token?.length);
        
        if (!token) {
            throw new Error("No token received");
        }
        
        console.log("Calling Drive API to copy spreadsheet...");
        
        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/copy`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: newName
                })
            }
        );
        
        console.log("Drive API response status:", response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error("API error response:", errorText);
            throw new Error(`API error: ${response.status} - ${errorText}`);
        }
        
        const newFile = await response.json();
        const newUrl = `https://docs.google.com/spreadsheets/d/${newFile.id}/edit`;
        
        console.log("Spreadsheet copied successfully:", newUrl);
        return newUrl;
        
    } catch (error) {
        console.error("Error in copySpreadsheet:", error);
        throw error;
    }
};