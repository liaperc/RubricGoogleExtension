const { resolve } = require("path");

(() => {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'GRADEBOOK_LOADED') {
            addButton();
        }
    });

    const addButton = () => {
        // Check if button already exists
        if (document.getElementById("rubric-button")) return;

        const container = document.querySelector("#gradebook-actions");
        
        const rubricButton = document.createElement("button");
        rubricButton.id = "rubric-button";
        rubricButton.innerText = "Format The Rubrics!";
        rubricButton.style.marginLeft = "10px";
        rubricButton.style.padding = "5px 10px";
        rubricButton.style.backgroundColor = "#0374B5";
        rubricButton.style.color = "white";
        rubricButton.style.border = "none";
        rubricButton.style.borderRadius = "3px";
        rubricButton.style.cursor = "pointer";
        
        rubricButton.onclick = buttonClicked;
        container.appendChild(rubricButton);
    };

    const fetchViaBackground = (url) => {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: 'fetchCSV',
                url: url
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (response && response.success) {
                    resolve(response.data);
                } else {
                    reject(new Error(response ? response.error : "Unknown error"));
                }
            });
        });
    };

    const buttonClicked = async () => {
        const button = document.getElementById("rubric-button");
        const originalText = button.innerText;
        button.disabled = true;
        button.innerText = "Loading...";
        
        try {
            //the following will get the CSV from canvas if testCSV = false, but for testing purposes I have a seperate CSV
            testCSV = true
            let csvContent
            if (!testCSV){
                csvContent = await getCSVContent();
            } else {
                //this literally just pulls the "testRubric.csv" from the files
                csvContent = await new Promise((resolve,reject) => {
                    chrome.runtime.sendMessage({
                        type: "getTestCSV"
                    }, (response) => {
                        if(chrome.runtime.lastError){
                            reject(new Error(chrome.runtime.lastError.message));
                        } else if (response && response.success) {
                            resolve(response.data);
                        } else {
                            reject(new Error(response ? response.error : "Unknown error"));
                        }
                    });
                });
            };
                
            const studentData = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ 
                    type: "sortData",
                    data: csvContent
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response && response.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error(response ? response.error : "Unknown error"));
                    }}
                );
            });
            console.log(studentData[0])
            const rubricFormatURL = await getRubricFormatURL();
            console.log(getRubricFormatURL)
            // window.open(rubricFormatURL, '_blank');
            // const sheetInfo = await new Promise((resolve, reject) => {
            //     chrome.runtime.sendMessage({
            //         type: "getSheetInfo",
            //     })
            // })
           
            // downloadCsv(csvContent, 'test.csv');
            alert("Rubrics formatted and downloaded successfully!");
            
        } catch (error) {
            console.error("Error processing rubrics:", error);
            alert("An error occurred while processing the rubrics: " + error.message);
        } finally {
            button.disabled = false;
            button.innerText = originalText;
        }
    };


    const getRubricFormatURL = async () => {
        //@TODO: update the message to be more specific
        
        const userInput = window.prompt("Please enter a Google Sheets link or spreadsheet ID:");
        
        if (!userInput) {
            throw new Error("No link provided");
        }
        
        const trimmedInput = userInput.trim();
        let spreadsheetId;
        
        // Extract spreadsheet ID
        
        if (trimmedInput.includes('docs.google.com/spreadsheets')) {
            
            const match = trimmedInput.match(/\/d\/([a-zA-Z0-9_-]+)/);
            spreadsheetId = match ? match[1] : null;
            console.log("Spreadsheet ID: ", spreadsheetId);
        } else if (trimmedInput.match(/^[a-zA-Z0-9_-]+$/)) {
            spreadsheetId = trimmedInput;
        }
        
        if (!spreadsheetId) {
            throw new Error("Could not extract spreadsheet ID");
        }
        
        // Prompt for new name
        const newName = window.prompt("Enter a name for the copy:", "Rubric Copy");
        if (!newName) {
            throw new Error("No name provided");
        }
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { 
                    type: "COPY_SPREADSHEET", 
                    spreadsheetId: spreadsheetId,
                    newName: newName
                },
                (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response.success) {
                        resolve(response.url);
                    } else {
                        reject(new Error(response.error));
                    }
                }
            );
        });
    };
    const getCSVContent = async () => {
        
        const courseId = window.location.pathname.match(/\/courses\/(\d+)/)?.[1];
        if (!courseId) throw new Error("Could not determine course ID");
        
        // Enhanced CSRF token detection
        let csrfToken = document.querySelector('input[name="authenticity_token"]')?.value;
        
        console.log('CSRF Token found:', csrfToken ? 'Yes' : 'No');

        if (!csrfToken) throw new Error("Could not find CSRF token");
        
        // Initiate the export
        const exportResponse = await fetch(`/courses/${courseId}/gradebook_csv`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-CSRF-Token': csrfToken,
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({
                "gradebook_csv": {
                    "include_final_grade_overrides": true,
                    "show_inactive_enrollments": false,
                    "include_unposted_grades": false
                }
            }),
            credentials: 'same-origin'
        });
        
        if (!exportResponse.ok) {
            throw new Error(`Export request failed: ${exportResponse.status}`);
        }
        
        const exportData = await exportResponse.json();
        
        // Get CSV URL using progress polling
        const csvUrl = await pollForCSVUrl(exportData.progress_id, csrfToken, exportData.attachment_id);
        if (!csvUrl) throw new Error("Could not get CSV download URL");
        
        // Fetch CSV content via background script
        return await fetchViaBackground(csvUrl);
    };

    const pollForCSVUrl = async (progressId, csrfToken, attachmentId) => {
        const maxPolls = 30;
        let pollCount = 0;
        
        while (pollCount < maxPolls) {
            pollCount++;
            const progressResponse = await fetch(`/api/v1/progress/${progressId}`, {
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-Token': csrfToken,
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'same-origin'
            });
            
            if (!progressResponse.ok) {
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }
            
            const progress = await progressResponse.json();
            
            if (progress.workflow_state === 'completed') {
                // Get attachment URL using the fallback attachment ID
                const attachmentResponse = await fetch(`/api/v1/files/${attachmentId}`, {
                    headers: {
                        'Accept': 'application/json',
                        'X-CSRF-Token': csrfToken,
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    credentials: 'same-origin'
                });
                
                if (attachmentResponse.ok) {
                    const attachment = await attachmentResponse.json();
                    return attachment.url;
                }
            } else if (progress.workflow_state === 'failed') {
                throw new Error(`Export failed: ${progress.message}`);
            }
            
            await new Promise(r => setTimeout(r, 1000));
        }
        
        throw new Error("Timed out waiting for export to complete");
    };

    const downloadCsv = (csvContent, filename) => {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
    };
})();