//for CSV parsing
import Papa from 'papaparse';
import * as utils from './backgroundUtils.js';

//primary listener to listen for when the gradebook on Canvas is opened
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('instructure.com') && tab.url.includes('gradebook')) {
        chrome.tabs.sendMessage(tabId, {type: 'GRADEBOOK_LOADED'});
    };
});

//listener for messages from content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Background script: Received message", request.type || request.action);
    
    //this request attempts to retrieve the CSV for the gradebook using the download link produced by Canvas
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
    //This generates a copy link to copy the spreadsheet
    if (request.type === "COPY_SPREADSHEET") {
        console.log("Background script: Copying spreadsheet", request.spreadsheetId);
        utils.copySpreadsheet(request.spreadsheetId, request.newName)
            .then(response => {
                console.log("Background script: Copy successful");
                sendResponse({ success: true, id: response});
            })
            .catch(error => {
                console.error("Copy failed:", error);
                sendResponse({ success: false, error: error.message });
            });
        
        return true;
    }
    //this calls the function to sort the CSV data
    if (request.type === "sortData"){
        console.log("Background script: Sorting CSV data");
        try{
            const sortedData = utils.sortData(request.data)
            console.log("Background script: Sort successful, students:", sortedData.studentData.length);
            sendResponse({ success: true, data: sortedData.studentData, standards: sortedData.standardData });
        } catch(error) {
            console.error("Failed to parse rubric data:", error);
            sendResponse({ success: false, error: error.message });
        }
        return true;
        
    }
    //this will get the test csv file
    if (request.type === "getTestCSV"){
        console.log("Background script: Getting test CSV");
        fetch(chrome.runtime.getURL("data/betterTestRubric.csv"))
        .then(response => response.text())
        .then(testCSV => {
            console.log("Background script: Test CSV fetched, length:", testCSV.length);
            sendResponse({success: true, data: testCSV});
        }).catch(error => {
            console.error("Background script: Error fetching test CSV:", error);
            sendResponse({
                success: false,
                error: error.message
            });
        });
        return true;
    }
    //this runs the code to push the data to the newly made sheet
    if (request.type === "formatTheRubrics"){
        console.log("Background script: Formatting rubrics");
        utils.formatRubrics(request.standards, request.data, request.id)
        .then(response => {
            console.log("Background script: Formatting successful");
            sendResponse({success: true, url: response});
        }).catch(error => {
            console.error("Background script: error formatting", error);
            sendResponse({
                success: false,
                error: error.message
            });
        });
        return true
    }
    return false
});


