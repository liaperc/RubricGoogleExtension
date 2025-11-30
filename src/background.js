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
        utils.copySpreadsheet(request.spreadsheetId, request.newName)
            .then(response => {
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
        
        try{
            const sortedData = utils.sortData(request.data)
            sendResponse({ success: true, data: sortedData.studentData, standards: sortedData.standardData });
        } catch(error) {
            console.error("Failed to parse rubric data:", error);
            sendResponse({ success: false, error: error.message });
        }
        return true;
        
    }
    //this will get the test csv file
    if (request.type === "getTestCSV"){
        //this can be changed to a different csv if wanted (either "data/longTestRubric - testRubric.csv" or "data/testRubric.csv" or "data/betterTestRubric.csv")
        fetch(chrome.runtime.getURL("data/betterTestRubric.csv"))
        .then(response => response.text())
        .then(testCSV => {
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
        utils.formatRubrics(request.standards, request.data, request.id)
        .then(response => {
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


