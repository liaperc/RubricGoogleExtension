console.log("Popup script loaded!");

async function checkTab() {
    const button = document.getElementById('downloadPdfs');
    const status = document.getElementById('status');
    
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab.url || !tab.url.includes('docs.google.com/spreadsheets')) {
            button.disabled = true;
            status.textContent = 'Please open a Google Sheets tab';
            return false;
        }
        
        // Check if download is in progress from background script
        const response = await chrome.runtime.sendMessage({ type: 'checkDownloadStatus' });
        
        if (response && response.isDownloading) {
            button.disabled = true;
            button.textContent = 'Downloading...';
            status.textContent = 'Download in progress...';
            return false;
        }
        
        button.disabled = false;
        button.textContent = 'Download Sheet PDFs';
        status.textContent = 'Ready to download PDFs';
        return true;
    } catch (error) {
        console.error('Error checking tab:', error);
        button.disabled = true;
        status.textContent = 'Error checking tab';
        return false;
    }
}

async function downloadPdfs() {
    const button = document.getElementById('downloadPdfs');
    const status = document.getElementById('status');
    
    try {
        button.disabled = true;
        button.textContent = 'Downloading...'; 
        status.textContent = 'Starting download...';
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        const spreadsheetId = tab.url.match(/\/d\/([a-zA-Z0-9-_]+)/)?.[1];
        if (!spreadsheetId) {
            status.textContent = 'Error: Could not find spreadsheet ID';
            button.textContent = 'Download Sheet PDFs'; 
            await checkTab();
            return;
        }
        
        status.textContent = 'Fetching sheet data...';
        
        chrome.runtime.sendMessage({
            type: 'downloadSheetPdfs',
            spreadsheetId: spreadsheetId,
            tabId: tab.id
        }, async (response) => {
            if (response && response.success) {
                const failedMsg = response.failed > 0 ? ` (${response.failed} failed)` : '';
                status.textContent = `Success! Downloaded ${response.count} PDFs${failedMsg}`;
                button.textContent = 'Download Sheet PDFs'; 
            } else {
                status.textContent = `Error: ${response?.error || 'Unknown error'}`;
                button.textContent = 'Download Sheet PDFs'; 
            }
            await checkTab();
        });
        
    } catch (error) {
        console.error('Error in downloadPdfs:', error);
        status.textContent = `Error: ${error.message}`;
        button.textContent = 'Download Sheet PDFs'; 
        await checkTab();
    }
}

document.addEventListener('DOMContentLoaded', checkTab);
chrome.tabs.onActivated.addListener(checkTab);
chrome.tabs.onUpdated.addListener(checkTab);

document.getElementById('downloadPdfs').addEventListener('click', downloadPdfs);
