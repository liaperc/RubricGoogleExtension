//for CSV parsing
importScripts("../libraries/papaparse.min.js");


//primary listener to listen for when the gradebook on Canvas is opened
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('instructure.com') && tab.url.includes('gradebook')) {
        chrome.tabs.sendMessage(tabId, {type: 'GRADEBOOK_LOADED'});
    };
});

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
    //this calls the function to sort the CSV data
    if (request.type === "sortData"){
        
        try{
            const studentList = sortData(request.data)
            sendResponse({ success: true, data: studentList });
        } catch(error) {
            console.error("Failed to parse rubric data:", error);
            sendResponse({ success: false, error: error.message });
        }
        return false;
        
    }
    if (request.type === "getTestCSV"){
        fetch(chrome.runtime.getURL("data/testRubric.csv"))
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
    return false
});

//returns a list of lists of length 2 in the format [Student Name, Dictionary]. The using the dictionary you can reference a standard by Dictionary["Standard Name"] and it will give you the score for the student. 
const sortData = (data) => {
    try{
        //row will be the first value and column will be the second
        const dataArray = Papa.parse(data, {
            header: false,
            skipEmptyLines: true,
            dynamicTyping: true
          }).data;
          
        console.log(dataArray)

        let startPoint = 0;
        let endPoint = 0;
        //starting and ending points for columns of rubric standards
        for (let i = 0; i < dataArray[0].length; i++){ 
            let celli = dataArray[1][i];
            let cellii = dataArray[0][i];

            //this is where useful info begins
            if (celli == "(read only)" && startPoint == 0){
                startPoint = i;
            };
            //this is where the useful info ends
            if (cellii == "Current Score" && endPoint == 0){
                endPoint = i;
                break;
            };
        };
        let usefulColumns = [];
        let standards = [];
        //this finds only the columns with final scores
        for (let i = startPoint; i < endPoint; i++){ 
            let celli = dataArray[0][i];
            if (celli.includes("Final Score") && !celli.includes("Unposted Final Score")){
                usefulColumns.push(i);
                //this is setting up for later
                standard = celli.replace("Final Score", "").trim();
                standards.push(standard);
            };
        };
        
        
        //this is the first row with a student 
        const firstStudentRow = 2;
        //autoset to last row
        let studentEnd = dataArray.length;
        //this loop finds the last useful row
        for (let i = firstStudentRow; i<dataArray.length; i++){
            if (dataArray[i][0] == "" || !dataArray[i][0]){
                studentEnd = i;
                break;
            };
        };

        let studentList = [];

        //Nueva does a grading system with a max of 4
        rubricMax = 4;
        //Where you round, i.e. a rubric score of 3.8654 with a decimal amount of 2 would become 3.87
        decimalAmount = 1;
        for (let z = firstStudentRow; z < studentEnd; z++){
            let studentName = dataArray[z][0];
 
            let individualDictionary = {};
            for (let i = 0; i < usefulColumns.length; i++){ 
                let celli = dataArray[z][usefulColumns[i]];
                //turns the nulls into zeroes
                celli = celli ?? 0;
                //these values are weridly in percentages so a 4 would be written as 100 and a 3 as 75
                let score = (rubricMax*(celli/100)).toFixed(decimalAmount);
                let standard = standards[i];
                
                individualDictionary[standard] = score;
                

            };

            studentList.push([studentName, individualDictionary]);
        };
        

        //A list that allows you to access each student's rubric score for each standard with the notation studentList[index][0:Name, 1:Dictionary["StandardName"]]
        return studentList;
    } catch(error){
        console.error("Error in sorting data", error);
        throw error;

    };
};
//this function creates a copy link for the example rubric, but akso requests an API authentication token for google sheets API access. Note you need to be on a non-Nueva account to have this work.
const copySpreadsheet = async (spreadsheetId, newName) => {
  
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