//for CSV parsing
importScripts("../libraries/papaparse.min.js");


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
        copySpreadsheet(request.spreadsheetId, request.newName)
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
            const sortedData = sortData(request.data)
            sendResponse({ success: true, data: sortedData.studentData, standards: sortedData.standardData });
        } catch(error) {
            console.error("Failed to parse rubric data:", error);
            sendResponse({ success: false, error: error.message });
        }
        return true;
        
    }
    //this will get the test csv file
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
    //this runs the code to push the data to the newly made sheet
    if (request.type === "formatTheRubrics"){
        formatRubrics(request.standards, request.data, request.id)
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


//returns a list of lists of length 2 in the format [Student Name, Dictionary]. The using the dictionary you can reference a standard by Dictionary["Standard Name"] and it will give you the score for the student. 
const sortData = (data) => {
    try{
        //row will be the first value and column will be the second
        const dataArray = Papa.parse(data, {
            header: false,
            skipEmptyLines: true,
            dynamicTyping: true
        }).data;
          

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
                console.log("score type, ", typeof score)
                individualDictionary[standard] = score;
                

            };

            studentList.push([studentName, individualDictionary]);
        };
        

        //A list that allows you to access each student's rubric score for each standard with the notation studentList[index][0:Name, 1:Dictionary["StandardName"]]
        return {studentData: studentList, standardData: standards};
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
        
        
        
        return newFile.id;
        
    } catch (error) {
        console.error("Error in copySpreadsheet:", error);
        throw error;
    }
};

const formatRubrics = async (standards, studentData, id) => {
    try{
        const token = await new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: false }, (token) => {
                if (chrome.runtime.lastError) {
                    chrome.identity.getAuthToken({ interactive: true }, (token) => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                        } else {
                            resolve(token);
                        }
                    });
                } else {
                    resolve(token);
                }
            });
        });
        console.log("standards: ", standards);
        console.log("student data", studentData);

        sheets = new SheetsAPI(id, token);
        const bounds = await sheets.getDataBounds('Sheet1');
        
        // Get all cells with formatting data at once
        const cellsWithFormatting = await sheets.getCellsWithFormatting(bounds.range);
        
        let standardPos = {};
        let foundStandards = [];
        
        // Find standard positions
        cellsWithFormatting.forEach(cell => {
            if (!cell.bold && cell.value) {
                for (let i = 0; i < standards.length; i++) {
                    const standard = standards[i];
                    if (!standardPos[standard] && 
                        standard.toLowerCase().includes(cell.value.trim().toLowerCase())) {
                        standardPos[standard] = [cell.row, cell.col - 1];
                        foundStandards.push(standard);
                    }
                }
            }
        });
        
        console.log(`Found ${foundStandards.length} out of ${standards.length} standards`);
        console.log("Found Standards: ", foundStandards);
        
        // Create tabs and write data - BATCH ALL WRITES
        for (let i = 0; i < studentData.length; i++){
            const student = studentData[i];
            const newTab = await sheets.duplicateSheetByTitle('Sheet1', student[0]);
            
            // Prepare all updates for this student in one batch
            const updates = [];
            
            for (let z = 0; z < foundStandards.length; z++){
                const standard = foundStandards[z];
                const pos = standardPos[standard];
                const score = student[1][standard];
                const colLetter = sheets.columnIndexToLetter(pos[1] - 1);
                
                updates.push({
                    range: `${newTab.title}!${colLetter}${pos[0]}`,
                    values: [[score]]
                });
            }
            
            // Write all updates at once using batchUpdate
            if (updates.length > 0) {
                console.log(`Writing ${updates.length} values for ${student[0]}`);
                await sheets.batchUpdate(updates);
            }
            
            // Add delay to avoid rate limiting (Google Sheets allows ~100 requests per 100 seconds per user)
            if (i < studentData.length - 1) { // Don't delay after the last student
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
            }
        }
        
        const newUrl = `https://docs.google.com/spreadsheets/d/${id}/edit`;
        return newUrl;

    } catch(error){
        console.error("Error formatting the sheet", error);
        throw error;
    }
};

class SheetsAPI {
    constructor(sheetId, authToken) {
      this.sheetId = sheetId;
      this.authToken = authToken;
      this.baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;
    }
  
    // Helper method to make API requests
    async request(endpoint, options = {}) {
      const url = `${this.baseUrl}${endpoint}`;
      const defaultOptions = {
        headers: {
          'Authorization': `Bearer ${this.authToken}`,
          'Content-Type': 'application/json'
        }
      };
  
      try {
        const response = await fetch(url, { ...defaultOptions, ...options });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(`Sheets API Error: ${error.error.message}`);
        }
        
        return await response.json();
      } catch (error) {
        console.error('Sheets API request failed:', error);
        throw error;
      }
    }
    async getSpreadsheetWithFormatting(ranges = []) {
        let url = '?includeGridData=true';
        if (ranges.length > 0) {
          url += '&' + ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&');
        }
        return await this.request(url);
    };
    async getCellsWithFormatting(range) {
        const data = await this.getSpreadsheetWithFormatting([range]);
        
        if (!data.sheets || data.sheets.length === 0) {
          return [];
        }
        
        const sheet = data.sheets[0];
        if (!sheet.data || !sheet.data[0] || !sheet.data[0].rowData) {
          return [];
        }
        
        const result = [];
        const startRow = sheet.data[0].startRow || 0;
        const startCol = sheet.data[0].startColumn || 0;
        
        sheet.data[0].rowData.forEach((rowData, rowIndex) => {
          if (!rowData.values) return;
          
          rowData.values.forEach((cellData, colIndex) => {
            const actualRow = startRow + rowIndex + 1; // 1-based
            const actualCol = startCol + colIndex + 1; // 1-based
            
            result.push({
              row: actualRow,
              col: actualCol,
              colLetter: this.columnIndexToLetter(actualCol - 1),
              value: cellData.formattedValue || '',
              bold: cellData.effectiveFormat?.textFormat?.bold || false,
              italic: cellData.effectiveFormat?.textFormat?.italic || false,
              fontSize: cellData.effectiveFormat?.textFormat?.fontSize,
              backgroundColor: cellData.effectiveFormat?.backgroundColor,
              textColor: cellData.effectiveFormat?.textFormat?.foregroundColor
            });
          });
        });
        
        return result;
    };
    
    // Check if a specific cell is bolded
    async isCellBold(sheetName, row, col) {
        const colLetter = this.columnIndexToLetter(col - 1);
        const range = `${sheetName}!${colLetter}${row}`;
        
        const data = await this.getSpreadsheetWithFormatting([range]);
        
        if (!data.sheets || data.sheets.length === 0) {
          return false;
        }
        
        const sheet = data.sheets[0];
        if (!sheet.data || !sheet.data[0] || !sheet.data[0].rowData) {
          return false;
        }
        
        const rowData = sheet.data[0].rowData[0];
        if (!rowData.values || !rowData.values[0]) {
          return false;
        }
        
        const cellData = rowData.values[0];
        return cellData.effectiveFormat?.textFormat?.bold || false;
    }
  
    // Get spreadsheet metadata
    async getSpreadsheetInfo() {
      return await this.request('');
    }
  
    // Read data from a range (e.g., "Sheet1!A1:D10")
    async readRange(range) {
      return await this.request(`/values/${encodeURIComponent(range)}`);
    }
  
    // Write data to a range
    async writeRange(range, values) {
      return await this.request(`/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        body: JSON.stringify({ values })
      });
    }
  
    // Append data to a sheet
    async appendData(range, values) {
      return await this.request(`/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        body: JSON.stringify({ values })
      });
    }
  
    // Clear a range
    async clearRange(range) {
      return await this.request(`/values/${encodeURIComponent(range)}:clear`, {
        method: 'POST'
      });
    }
  
    // Batch get multiple ranges
    async batchGet(ranges) {
      const rangesParam = ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&');
      return await this.request(`/values:batchGet?${rangesParam}`);
    }
  
    // Batch update multiple ranges
    async batchUpdate(data) {
      return await this.request(`/values:batchUpdate`, {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: data
        })
      });
    }
  
    // Duplicate a sheet/tab
    async duplicateSheet(sourceSheetId, newSheetName = null) {
      const request = {
        duplicateSheet: {
          sourceSheetId: sourceSheetId,
          insertSheetIndex: 1,
          newSheetName: newSheetName
        }
      };
  
      const response = await this.request(':batchUpdate', {
        method: 'POST',
        body: JSON.stringify({ requests: [request] })
      });
  
      return response.replies[0].duplicateSheet.properties;
    }
  
    // Duplicate a sheet by its title
    async duplicateSheetByTitle(sheetTitle, newSheetName = null) {
      const info = await this.getSpreadsheetInfo();
      const sheet = info.sheets.find(s => s.properties.title === sheetTitle);
      
      if (!sheet) {
        throw new Error(`Sheet with title "${sheetTitle}" not found`);
      }
  
      return await this.duplicateSheet(sheet.properties.sheetId, newSheetName);
    }
  
    // Get all sheets/tabs info
    async getAllSheets() {
      const info = await this.getSpreadsheetInfo();
      return info.sheets.map(sheet => ({
        sheetId: sheet.properties.sheetId,
        title: sheet.properties.title,
        index: sheet.properties.index
      }));
    }
  
    // Find the last row with data in a sheet
    async getLastRow(sheetName, columnToCheck = 'A') {
      try {
        // Read a large range from the column
        const result = await this.readRange(`${sheetName}!${columnToCheck}:${columnToCheck}`);
        
        if (!result.values) {
          return 0; // No data
        }
        
        return result.values.length;
      } catch (error) {
        console.error('Error finding last row:', error);
        return 0;
      }
    }
  
    // Find the last column with data in a sheet (returns column letter like 'F')
    async getLastColumn(sheetName, rowToCheck = 1) {
      try {
        // Read the entire first row
        const result = await this.readRange(`${sheetName}!${rowToCheck}:${rowToCheck}`);
        
        if (!result.values || !result.values[0]) {
          return 'A'; // No data
        }
        
        const lastColIndex = result.values[0].length - 1;
        return this.columnIndexToLetter(lastColIndex);
      } catch (error) {
        console.error('Error finding last column:', error);
        return 'A';
      }
    }
  
    // Get the actual data bounds (last row and column with data)
    async getDataBounds(sheetName) {
      try {
        // Read a large range to find boundaries
        const result = await this.readRange(`${sheetName}!A1:ZZZ10000`);
        
        if (!result.values || result.values.length === 0) {
          return { lastRow: 0, lastColumn: 'A', range: `${sheetName}!A1:A1` };
        }
  
        const lastRow = result.values.length;
        
        // Find the maximum column across all rows
        let maxCol = 0;
        result.values.forEach(row => {
          if (row.length > maxCol) {
            maxCol = row.length;
          }
        });
        
        const lastColumn = this.columnIndexToLetter(maxCol - 1);
        
        return {
          lastRow,
          lastColumn,
          range: `${sheetName}!A1:${lastColumn}${lastRow}`
        };
      } catch (error) {
        console.error('Error getting data bounds:', error);
        return { lastRow: 0, lastColumn: 'A', range: `${sheetName}!A1:A1` };
      }
    }
  
    // Convert column index (0-based) to letter (A, B, C, ..., Z, AA, AB, ...)
    columnIndexToLetter(index) {
      let letter = '';
      while (index >= 0) {
        letter = String.fromCharCode((index % 26) + 65) + letter;
        index = Math.floor(index / 26) - 1;
      }
      return letter;
    }
  
    // Convert column letter to index (0-based)
    columnLetterToIndex(letter) {
      let index = 0;
      for (let i = 0; i < letter.length; i++) {
        index = index * 26 + (letter.charCodeAt(i) - 64);
      }
      return index - 1;
    }
    // Write to a single cell using row and column numbers
    async writeCell(sheetName, row, col, value) {
        const colLetter = this.columnIndexToLetter(col - 1);
        const range = `${sheetName}!${colLetter}${row}`;
        return await this.writeRange(range, [[value]]);
    }
  }
