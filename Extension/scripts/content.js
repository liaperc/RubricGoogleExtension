(() => {
    // Wait for the page to fully load before attempting to insert the button
    window.addEventListener('load', () => {
        console.log("Page loaded, checking for gradebook");
        setTimeout(checkAndAddButton, 1000); // Wait a bit for dynamic elements
    });
    
    // Also listen for navigation events in case the gradebook loads later
    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            console.log("URL changed, checking for gradebook");
            setTimeout(checkAndAddButton, 1000);
        }
    }).observe(document, {subtree: true, childList: true});
    
    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'GRADEBOOK_LOADED') {
            console.log("Received gradebook loaded message");
            checkAndAddButton();
        }
        return true;
    });

    const checkAndAddButton = () => {
        console.log("Checking for gradebook actions element");
        
        // Try multiple potential container selectors
        const selectors = [
            "#gradebook-actions",
            ".gradebook-header",
            ".gradebook_menu",
            ".gradebook-toolbar",
            ".gradebook_options",
            "#gradebook_options",
            ".gradebook-actions"
        ];
        
        let container = null;
        for (const selector of selectors) {
            container = document.querySelector(selector);
            if (container) {
                console.log(`Found container using selector: ${selector}`);
                break;
            }
        }
        
        // If we still don't have a container, try to find any element that might be appropriate
        if (!container) {
            console.log("No container found with standard selectors, looking for alternatives");
            
            // Look for any element with "gradebook" in the ID or class
            const elements = document.querySelectorAll("[id*='gradebook'],[class*='gradebook']");
            if (elements.length > 0) {
                console.log(`Found ${elements.length} potential containers with 'gradebook' in ID/class`);
                container = elements[0];
            } else {
                // Try to find the header section
                const header = document.querySelector("header") || 
                               document.querySelector(".header") || 
                               document.querySelector(".ic-app-nav-toggle-and-crumbs");
                               
                if (header) {
                    console.log("Using page header as button container");
                    container = header;
                }
            }
        }
        
        // If we found a container, add the button
        if (container) {
            addButton(container);
        } else {
            console.error("Could not find a suitable container for the button");
            
            // Last resort: Add button to the body with absolute positioning
            addFloatingButton();
        }
    };

    const addButton = (container) => {
        // Check if button already exists to avoid duplicates
        const buttonExists = document.getElementById("rubric-button");
        if (buttonExists) {
            console.log("Button already exists, not adding again");
            return;
        }
        
        console.log("Adding button to container:", container);
        
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
        rubricButton.title = "Download Formatted Rubrics";
        
        rubricButton.onclick = () => {
            buttonClicked();
        };
        
        container.appendChild(rubricButton);
        console.log("Button added successfully");
    };
    
    const addFloatingButton = () => {
        // Check if floating button already exists
        const buttonExists = document.getElementById("rubric-button-floating");
        if (buttonExists) return;
        
        console.log("Adding floating button");
        
        const floatingButton = document.createElement("button");
        floatingButton.id = "rubric-button-floating";
        floatingButton.innerText = "Format The Rubrics!";
        floatingButton.style.position = "fixed";
        floatingButton.style.top = "70px";
        floatingButton.style.right = "20px";
        floatingButton.style.zIndex = "9999";
        floatingButton.style.padding = "10px 15px";
        floatingButton.style.backgroundColor = "#0374B5";
        floatingButton.style.color = "white";
        floatingButton.style.border = "none";
        floatingButton.style.borderRadius = "5px";
        floatingButton.style.cursor = "pointer";
        floatingButton.style.boxShadow = "0 2px 5px rgba(0,0,0,0.2)";
        floatingButton.title = "Download Formatted Rubrics";
        
        floatingButton.onclick = () => {
            buttonClicked();
        };
        
        document.body.appendChild(floatingButton);
        console.log("Floating button added");
    };

    // Function to fetch via background script to bypass CORS
    const fetchViaBackground = (url) => {
        return new Promise((resolve, reject) => {
            if (!chrome.runtime || !chrome.runtime.sendMessage) {
                reject(new Error("Chrome extension API not available"));
                return;
            }
            
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
        const button = document.getElementById("rubric-button") || 
                       document.getElementById("rubric-button-floating");
                       
        if (!button) {
            console.error("Button not found when clicked");
            return;
        }
        
        const originalText = button.innerText;
        button.disabled = true;
        
        try { 
            button.innerText = "Loading...";

            // Step 1: Get the CSV download URL and content directly
            const csvContent = await getCSVContent();
            
            if (!csvContent) {
                alert("Failed to get CSV content");
                return;
            }
            
            // Step 2: Process the CSV data
            const modifiedCsv = processCSVData(csvContent);
            
            // Step 3: Download the modified CSV
            downloadCsv(modifiedCsv, 'formatted-rubrics.csv');
            alert("Rubrics formatted and downloaded successfully!");
            
        } catch (error) {
            console.error("Error processing rubrics:", error);
            
            if (error.message === "CORS_BLOCKED - Please manually download and select the CSV file") {
                // Fallback to the original manual process
                alert("Due to browser restrictions, the CSV file will open in a new tab. Please download it and then click the button again to select the file.");
                // You could implement the manual file selection here as a fallback
            } else {
                alert("An error occurred while processing the rubrics: " + error.message);
            }
        } finally {
            button.disabled = false;
            button.innerText = originalText;
        }
    };

    // Modified function to get CSV content directly instead of downloading
    const getCSVContent = async () => {
        try {
            console.log("Attempting to get CSV content directly");
            
            // Get course ID
            const courseId = window.ENV?.CONTEXT_ID || window.location.pathname.match(/\/courses\/(\d+)/)?.[1];
            if (!courseId) {
                console.error("Could not determine course ID");
                throw new Error("Could not determine course ID");
            }
            
            // Get CSRF token which is needed for the request
            let csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
            
            if (!csrfToken && window.ENV && window.ENV.AUTHENTICITY_TOKEN) {
                csrfToken = window.ENV.AUTHENTICITY_TOKEN;
            }
            
            if (!csrfToken && window.INST && window.INST.authToken) {
                csrfToken = window.INST.authToken;
            }
            
            if (!csrfToken) {
                const csrfInput = document.querySelector('input[name="authenticity_token"]');
                if (csrfInput) {
                    csrfToken = csrfInput.value;
                }
            }
            
            if (!csrfToken) {
                console.error("Could not find CSRF token");
                throw new Error("Could not find CSRF token");
            }
            
            // Initiate the export process
            const exportUrl = `/courses/${courseId}/gradebook_csv`;
            
            const exportResponse = await fetch(exportUrl, {
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
                console.error("Export request failed:", exportResponse.status);
                throw new Error(`Export request failed: ${exportResponse.status}`);
            }
            
            // Parse the response to get progress information
            const exportData = await exportResponse.json();
            console.log("Export initiated, full response:", JSON.stringify(exportData, null, 2));
            
            // Get the CSV download URL
            let csvUrl = null;
            
            // If there's a progress ID, poll until the export is complete
            if (exportData && exportData.progress_id) {
                console.log("Using progress polling method");
                csvUrl = await pollForCSVUrl(exportData.progress_id, csrfToken, exportData.attachment_id);
            } 
            // Try different possible attachment ID locations
            else if (exportData && exportData.attachment_id) {
                console.log("Using direct attachment ID method");
                csvUrl = await getAttachmentUrl(exportData.attachment_id, csrfToken);
            }
            // Check if the URL is directly in the response
            else if (exportData && exportData.url) {
                console.log("Found direct URL in response");
                csvUrl = exportData.url;
            }
            // Check for nested attachment data
            else if (exportData && exportData.attachment && exportData.attachment.url) {
                console.log("Found nested attachment URL");
                csvUrl = exportData.attachment.url;
            }
            // Check for different property names that might contain the URL
            else if (exportData && exportData.csv_url) {
                console.log("Found csv_url property");
                csvUrl = exportData.csv_url;
            }
            // Check if we have file information
            else if (exportData && exportData.file && exportData.file.url) {
                console.log("Found file URL");
                csvUrl = exportData.file.url;
            }
            
            console.log("Final CSV URL:", csvUrl);
            
            if (!csvUrl) {
                console.error("No CSV URL found in any expected location. Available keys:", Object.keys(exportData || {}));
                throw new Error("Could not get CSV download URL from response");
            }
            
            // Fetch the CSV content directly
            console.log("Fetching CSV content from:", csvUrl);
            
            // Since we're dealing with CORS issues, try to fetch through the extension's background script
            try {
                const csvContent = await fetchViaBackground(csvUrl);
                if (csvContent) {
                    console.log("CSV content fetched successfully via background, length:", csvContent.length);
                    return csvContent;
                }
            } catch (backgroundError) {
                console.log("Background fetch failed, trying direct fetch with no-cors:", backgroundError.message);
            }
            
            // Fallback: try direct fetch with no-cors mode
            const csvResponse = await fetch(csvUrl, {
                mode: 'no-cors',
                credentials: 'omit'
            });
            
            if (!csvResponse.ok && csvResponse.type !== 'opaque') {
                throw new Error(`Failed to fetch CSV: ${csvResponse.status}`);
            }
            
            // For opaque responses, we can't read the content directly
            if (csvResponse.type === 'opaque') {
                console.log("Received opaque response - redirecting to manual download");
                // If we can't read the content due to CORS, trigger a download and ask user to upload
                window.open(csvUrl, '_blank');
                throw new Error("CORS_BLOCKED - Please manually download and select the CSV file");
            }
            
            const csvContent = await csvResponse.text();
            console.log("CSV content fetched successfully, length:", csvContent.length);
            
            return csvContent;
            
        } catch (error) {
            console.error("Error getting CSV content:", error);
            throw error;
        }
    };

    // Helper function to poll for CSV URL when using progress tracking
    const pollForCSVUrl = async (progressId, csrfToken, fallbackAttachmentId = null) => {
        const maxPolls = 30;
        let pollCount = 0;
        
        while (pollCount < maxPolls) {
            pollCount++;
            const progressUrl = `/api/v1/progress/${progressId}`;
            console.log(`Polling progress (${pollCount}/${maxPolls})...`);
            
            const progressResponse = await fetch(progressUrl, {
                headers: {
                    'Accept': 'application/json',
                    'X-CSRF-Token': csrfToken,
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'same-origin'
            });
            
            if (!progressResponse.ok) {
                console.error("Progress check failed:", progressResponse.status);
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }
            
            const progress = await progressResponse.json();
            console.log("Progress status:", progress.workflow_state);
            console.log("Full progress object:", JSON.stringify(progress, null, 2));
            
            if (progress.workflow_state === 'completed') {
                // Try multiple possible locations for the URL
                if (progress.results && progress.results.attachment && progress.results.attachment.url) {
                    console.log("Found URL in progress.results.attachment.url");
                    return progress.results.attachment.url;
                }
                if (progress.results && progress.results.url) {
                    console.log("Found URL in progress.results.url");
                    return progress.results.url;
                }
                if (progress.attachment && progress.attachment.url) {
                    console.log("Found URL in progress.attachment.url");
                    return progress.attachment.url;
                }
                // If there's an attachment_id, try to get the URL from it
                if (progress.results && progress.results.attachment_id) {
                    console.log("Found attachment_id in progress.results, fetching URL");
                    return await getAttachmentUrl(progress.results.attachment_id, csrfToken);
                }
                if (progress.attachment_id) {
                    console.log("Found attachment_id in progress, fetching URL");
                    return await getAttachmentUrl(progress.attachment_id, csrfToken);
                }
                
                // If we have a fallback attachment ID from the initial response, use it
                if (fallbackAttachmentId) {
                    console.log("Using fallback attachment_id from initial response:", fallbackAttachmentId);
                    return await getAttachmentUrl(fallbackAttachmentId, csrfToken);
                }
                
                // Don't return the progress URL itself - that's not the CSV file
                if (progress.url && !progress.url.includes('/progress/')) {
                    console.log("Found non-progress URL in progress.url");
                    return progress.url;
                }
                
                console.error("Export completed but no CSV URL found in progress response");
                console.log("Available progress keys:", Object.keys(progress));
                if (progress.results) {
                    console.log("Available progress.results keys:", Object.keys(progress.results));
                }
                break;
            } else if (progress.workflow_state === 'failed') {
                console.error("Export failed:", progress.message);
                throw new Error(`Export failed: ${progress.message}`);
            }
            
            await new Promise(r => setTimeout(r, 1000));
        }
        
        if (pollCount >= maxPolls) {
            throw new Error("Timed out waiting for export to complete");
        }
        
        return null;
    };

    // Helper function to get attachment URL from attachment ID
    const getAttachmentUrl = async (attachmentId, csrfToken) => {
        const attachmentUrl = `/api/v1/files/${attachmentId}`;
        
        const attachmentResponse = await fetch(attachmentUrl, {
            headers: {
                'Accept': 'application/json',
                'X-CSRF-Token': csrfToken,
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'same-origin'
        });
        
        if (attachmentResponse.ok) {
            const attachment = await attachmentResponse.json();
            return attachment.url || null;
        }
        
        return null;
    };

    // Function to process the CSV data
    const processCSVData = (csvContent) => {
        console.log("Processing CSV data...");
        
        // Here you would add your custom processing logic
        // For now, just add a simple header comment
        return "// Formatted by Rubric Extension\n" + csvContent;
    };

    // Function to download CSV data
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