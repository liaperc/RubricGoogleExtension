import Papa from 'papaparse';
//returns a list of lists of length 2 in the format [Student Name, Dictionary]. The using the dictionary you can reference a standard by Dictionary["Standard Name"] and it will give you the score for the student. 
export const sortData = (data) => {
    try{
        //row will be the first value and column will be the second
        const dataArray = Papa.parse(data, {
            header: false,
            skipEmptyLines: true,
            dynamicTyping: true
        }).data; 
        //this is the first row with a student 
        let firstStudentRow = false; //TODO make this more dynamic because johns listed points possible as a student
        //last row
        let studentEnd = dataArray.length;
        //this loop finds the last useful row
        for (let i = 0; i<dataArray.length; i++){
            if ((dataArray[i][0]) && (dataArray[i][0]).includes("Points Possible")){
                firstStudentRow = i+1;
            };
        };

        let startPoint = 0;
        let endPoint = 0;
        //starting and ending points for columns of rubric standards
        for (let i = 0; i < dataArray[0].length; i++){ 
            let celli = dataArray[firstStudentRow-1][i];
            let cellii = dataArray[0][i];

            //this is where useful info begins
            if (celli == "(read only)" && startPoint == 0){
                startPoint = i;
            };
            //this is where the useful info ends
            if ((cellii == "Current Score" || cellii == "Current Points") && endPoint == 0){
                endPoint = i;
                break;
            };
        };
        let usefulColumns = [];
        let standards = [];
        //this finds only the columns with final scores
        for (let i = startPoint; i < endPoint; i++){ 
            let celli = dataArray[0][i];
            if (celli.includes("Unposted Current Score")){
                usefulColumns.push(i);
                //this is setting up for later
                let standard = celli.replace("Unposted Current Score", "").trim();
                standards.push(standard);
            };
        };
        
        
        

        let studentList = [];

        //Nueva does a grading system with a max of 4
        const rubricMax = 4;
        //Where you round, e.g. a rubric score of 3.8654 with a decimal amount of 2 would become 3.87
        const decimalAmount = 1;
        for (let z = firstStudentRow; z < studentEnd; z++){
            let studentName = dataArray[z][0];
            let studentId = dataArray[z][1];
            studentName += ` (${studentId})` //this is in case of duplicate names because google sheets doesn't allow duplicates
 
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
        return {studentData: studentList, standardData: standards};
    } catch(error){
        console.error("Error in sorting data", error);
        throw error;

    };
};
//this function creates a copy link for the example rubric, but akso requests an API authentication token for google sheets API access. Note you need to be on a non-Nueva account to have this work.
export const copySpreadsheet = async (spreadsheetId, newName) => {
  
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

export const formatRubrics = async (standards, studentData, id) => {
    try {
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

        const sheets = new SheetsAPI(id, token);
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
        
        // More aggressive batching now that we have rate limiting
        const batchSize = 20; 
        const allTabs = [];

        for (let i = 0; i < studentData.length; i += batchSize) {
            const batch = studentData.slice(i, i + batchSize);
            const batchPromises = batch.map(student => 
                sheets.duplicateSheetByTitle('Sheet1', student[0])
            );
            
            const batchTabs = await Promise.all(batchPromises);
            allTabs.push(...batchTabs);
            
            const usage = rateLimiter.getUsageInfo();
            console.log(`Created batch ${Math.floor(i/batchSize) + 1}, API usage: ${usage.percentage}%`);
        }

        // Write data to all tabs with minimal delays
        for (let i = 0; i < studentData.length; i++){
            const student = studentData[i];
            const newTab = allTabs[i];
            
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
            
            if (updates.length > 0) {
                console.log(`Writing ${updates.length} values for ${student[0]}`);
                await sheets.batchUpdate(updates);
            }
            
            // Show progress
            if (i % 10 === 0) {
                const usage = rateLimiter.getUsageInfo();
                console.log(`Progress: ${i}/${studentData.length} students, API usage: ${usage.percentage}%`);
            }
        }
        
        // NEW: Reorder sheets to match original student order
        console.log("Reordering sheets to match student list order...");
        const desiredOrder = ['Sheet1', ...studentData.map(student => student[0])];
        await sheets.reorderSheets(desiredOrder);
        console.log("Sheet reordering complete!");
        
        const newUrl = `https://docs.google.com/spreadsheets/d/${id}/edit`;
        return newUrl;

    } catch(error){
        console.error("Error formatting the sheet", error);
        throw error;
    }
};

export class SheetsAPI {
    constructor(sheetId, authToken) {
        this.sheetId = sheetId;
        this.authToken = authToken;
        this.baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;
    }

    // Helper method to make API requests with rate limiting
    async request(endpoint, options = {}) {
        // Wait if we're approaching the rate limit
        await rateLimiter.waitIfNeeded();
        
        const usage = rateLimiter.getUsageInfo();
        console.log(`API Usage: ${usage.current}/${usage.max} (${usage.percentage}%)`);
        
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
                // Handle rate limit errors specifically
                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After');
                    const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
                    console.log(`429 Rate Limited! Waiting ${waitTime}ms`);
                    
                    // Reset our rate limiter state since we hit the actual limit
                    this.requests = [];
                    
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    return this.request(endpoint, options); // Retry
                }
                
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('API request failed:', error);
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

    // Reorder sheets to match a specific order
    async reorderSheets(desiredOrder) {
        const info = await this.getSpreadsheetInfo();
        const currentSheets = info.sheets.map(sheet => ({
            sheetId: sheet.properties.sheetId,
            title: sheet.properties.title,
            currentIndex: sheet.properties.index
        }));

        const requests = [];
        
        // Create move requests for each sheet to match desired order
        desiredOrder.forEach((desiredTitle, targetIndex) => {
            const sheet = currentSheets.find(s => s.title === desiredTitle);
            if (sheet && sheet.currentIndex !== targetIndex) {
                requests.push({
                    updateSheetProperties: {
                        properties: {
                            sheetId: sheet.sheetId,
                            index: targetIndex
                        },
                        fields: 'index'
                    }
                });
            }
        });

        if (requests.length > 0) {
            console.log(`Reordering ${requests.length} sheets...`);
            await this.request(':batchUpdate', {
                method: 'POST',
                body: JSON.stringify({ requests })
            });
        }
    }

    // Reorder sheets alphabetically
    async reorderSheetsAlphabetically() {
        const info = await this.getSpreadsheetInfo();
        const sheetTitles = info.sheets
            .map(sheet => sheet.properties.title)
            .sort(); // Alphabetical sort
        
        await this.reorderSheets(sheetTitles);
    }
  }

export class RateLimiter {
    constructor(maxRequests = 90, timeWindow = 100000) {
        this.maxRequests = maxRequests;
        this.timeWindow = timeWindow;
        this.requests = [];
        this.waitingQueue = [];
        this.isProcessing = false;
        this.processingPromise = null; // Track the current processing promise
    }

    async waitIfNeeded() {
        console.log(`[RateLimiter] Request queued. Queue length: ${this.waitingQueue.length + 1}`);
        
        // Add this request to the queue and wait for its turn
        return new Promise((resolve) => {
            this.waitingQueue.push({
                resolve,
                timestamp: Date.now(),
                id: Math.random().toString(36).substr(2, 9)
            });
            console.log(`[RateLimiter] Request ${this.waitingQueue[this.waitingQueue.length - 1].id} added to queue`);
            
            // Start processing if not already processing
            if (!this.isProcessing) {
                this.processQueue();
            }
        });
    }

    async processQueue() {
        // If already processing, wait for the current processing to finish
        if (this.isProcessing) {
            console.log(`[RateLimiter] Already processing, waiting for current process to finish`);
            if (this.processingPromise) {
                await this.processingPromise;
            }
            return;
        }

        console.log(`[RateLimiter] Starting queue processing. Queue length: ${this.waitingQueue.length}`);
        this.isProcessing = true;
        
        // Create a promise that resolves when processing is complete
        this.processingPromise = this._processQueueInternal();
        await this.processingPromise;
        
        this.isProcessing = false;
        this.processingPromise = null;
        console.log(`[RateLimiter] Queue processing completed`);
    }

    async _processQueueInternal() {
        while (this.waitingQueue.length > 0) {
            const now = Date.now();
            
            // Remove requests older than our time window
            const oldRequestCount = this.requests.length;
            this.requests = this.requests.filter(timestamp => 
                now - timestamp < this.timeWindow
            );
            
            if (oldRequestCount !== this.requests.length) {
                console.log(`[RateLimiter] Cleaned ${oldRequestCount - this.requests.length} old requests`);
            }

            console.log(`[RateLimiter] Current usage: ${this.requests.length}/${this.maxRequests} (${(this.requests.length / this.maxRequests * 100).toFixed(1)}%)`);

            // If we're at the limit, wait until the oldest request expires
            if (this.requests.length >= this.maxRequests) {
                const oldestRequest = Math.min(...this.requests);
                const waitTime = this.timeWindow - (now - oldestRequest) + 100;
                
                console.log(`[RateLimiter] Rate limit reached! Waiting ${waitTime}ms (Queue: ${this.waitingQueue.length})`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue; // Check again after waiting
            }

            // Process the next request in queue
            const requestInfo = this.waitingQueue.shift();
            this.requests.push(Date.now());
            
            console.log(`[RateLimiter] Processing request ${requestInfo.id}. New usage: ${this.requests.length}/${this.maxRequests}`);
            requestInfo.resolve();
        }
    }

    getUsageInfo() {
        const now = Date.now();
        const recentRequests = this.requests.filter(timestamp => 
            now - timestamp < this.timeWindow
        );
        
        return {
            current: recentRequests.length,
            max: this.maxRequests,
            percentage: (recentRequests.length / this.maxRequests * 100).toFixed(1),
            timeUntilReset: this.requests.length > 0 ? 
                Math.max(0, this.timeWindow - (now - Math.min(...this.requests))) : 0,
            queueLength: this.waitingQueue.length
        };
    }
}

// Create global rate limiter instance
const rateLimiter = new RateLimiter();
