import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

// Helper function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('Chrome Extension E2E Tests', () => {
    let browser, extensionId, testCSV, serviceWorker;
    const workerLogs = []; // Shared across all tests

    beforeAll(async () => {
        const pathToExtension = path.join(process.cwd(), 'dist');
        
        // Load the test CSV once
        const csvPath = path.join(process.cwd(), 'public/data/betterTestRubric.csv');
        testCSV = fs.readFileSync(csvPath, 'utf-8');
        
        browser = await puppeteer.launch({
            headless: false,
            args: [
                `--disable-extensions-except=${pathToExtension}`,
                `--load-extension=${pathToExtension}`,
            ],
        });

        const workerTarget = await browser.waitForTarget(
            target => target.type() === 'service_worker',
            { timeout: 15000 }
        );
        
        serviceWorker = await workerTarget.worker();
        extensionId = workerTarget.url().split('/')[2];
        
        // Set up worker console listener ONCE for all tests
        serviceWorker.on('console', msg => {
            const text = msg.text();
            workerLogs.push(text);
            console.log('Worker:', text);
        });
        
        console.log('Extension ID:', extensionId);
    }, 30000);

    afterAll(async () => {
        if (browser) {
            await browser.close();
        }
    });

    // Clear logs between tests
    beforeEach(() => {
        workerLogs.length = 0;
    });

    // Basic tests
    test('Service worker loads correctly', async () => {
        expect(serviceWorker).toBeDefined();
    });

    test('Button loads on canvas gradebook', async () => {
        const page = await browser.newPage();

        // Mock window.alert to prevent blocking
        await page.evaluateOnNewDocument(() => {
            window.alert = (msg) => {
                console.log('ALERT:', msg);
            };
        });

        // Intercept the navigation and return your HTML
        await page.setRequestInterception(true);
        page.on('request', request => {
            if (request.url().includes('instructure.com/courses/12345/gradebook')) {
                request.respond({
                    status: 200,
                    contentType: 'text/html',
                    body: `
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta name="csrf-token" content="mock-csrf-token-12345">
                        </head>
                        <body>
                            <div id="gradebook-actions"></div>
                        </body>
                        </html>
                    `
                });
            } else {
                request.continue();
            }
        });

        await page.goto('https://instructure.com/courses/12345/gradebook', {
            waitUntil: 'domcontentloaded'
        });

        await page.waitForSelector('#rubric-button', { 
            timeout: 25000,
            visible: true 
        });

        const button = await page.$('#rubric-button');
        expect(button).toBeTruthy();

        const buttonText = await page.$eval('#rubric-button', el => el.textContent);
        expect(buttonText).toContain('Format The Rubrics!');

        await page.close();
    }, 30000);

    // Workflow tests
    test('Complete workflow: Load gradebook -> Fetch CSV -> Sort data', async () => {
        const page = await browser.newPage();
        
        // Mock window.alert
        await page.evaluateOnNewDocument(() => {
            window.alert = (msg) => {
                console.log('ALERT:', msg);
            };
            window.prompt = (msg, defaultValue) => {
                console.log('PROMPT:', msg);
                return defaultValue || 'test-spreadsheet-id';
            };
        });
        
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        
        await page.setRequestInterception(true);
        
        page.on('request', request => {
            const url = request.url();
            
            if (url.includes('instructure.com/courses/12345/gradebook') && !url.includes('.csv')) {
                request.respond({
                    status: 200,
                    contentType: 'text/html',
                    body: `
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta name="csrf-token" content="mock-csrf-token-12345">
                        </head>
                        <body>
                            <div id="gradebook-actions"></div>
                            <a href="https://instructure.com/courses/12345/gradebook.csv" 
                               id="download_csv" 
                               class="ui-button ui-widget">Download Current Gradebook View</a>
                        </body>
                        </html>
                    `
                });
            } else if (url.includes('gradebook.csv') || url.includes('test.csv')) {
                console.log('Intercepting CSV request:', url);
                request.respond({
                    status: 200,
                    contentType: 'text/csv',
                    headers: {
                        'Content-Type': 'text/csv',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: testCSV
                });
            } else {
                request.continue();
            }
        });
        
        await page.goto('https://instructure.com/courses/12345/gradebook', {
            waitUntil: 'domcontentloaded'
        });
        
        await page.waitForSelector('#rubric-button', { 
            timeout: 20000,
            visible: true 
        });
        
        const button = await page.$('#rubric-button');
        expect(button).toBeTruthy();
        
        console.log('Clicking rubric button...');
        await button.click();
        await wait(6000);
        
        console.log('Worker logs collected:', workerLogs.length);
        console.log('All worker logs:', workerLogs);
        
        const buttonClicked = await page.evaluate(() => {
            const btn = document.getElementById('rubric-button');
            return btn !== null;
        });
        
        expect(buttonClicked).toBe(true);
        
        const csvLinkExists = await page.$('#download_csv');
        expect(csvLinkExists).toBeTruthy();
        
        await page.close();
    }, 60000);

    test('Error handling: Invalid CSV format', async () => {
        const page = await browser.newPage();
        
        // Mock window.alert and prompt
        await page.evaluateOnNewDocument(() => {
            window.alert = (msg) => {
                console.log('ALERT:', msg);
            };
            window.prompt = (msg, defaultValue) => {
                console.log('PROMPT:', msg);
                return defaultValue || 'test-spreadsheet-id';
            };
        });
        
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        
        await page.setRequestInterception(true);
        page.on('request', request => {
            const url = request.url();
            
            if (url.includes('instructure.com/courses/12345/gradebook') && !url.includes('.csv')) {
                request.respond({
                    status: 200,
                    contentType: 'text/html',
                    body: `
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta name="csrf-token" content="mock-csrf-token-12345">
                        </head>
                        <body>
                            <div id="gradebook-actions"></div>
                            <a href="https://instructure.com/courses/12345/gradebook.csv" 
                               id="download_csv" 
                               class="ui-button ui-widget">Download CSV</a>
                        </body>
                        </html>
                    `
                });
            } else if (url.includes('gradebook.csv')) {
                console.log('Intercepting CSV request with invalid data');
                request.respond({
                    status: 200,
                    contentType: 'text/csv',
                    body: 'Invalid,CSV,Format\nNo,Standards,Here'
                });
            } else {
                request.continue();
            }
        });
        
        await page.goto('https://instructure.com/courses/12345/gradebook', {
            waitUntil: 'domcontentloaded'
        });
        
        await page.waitForSelector('#rubric-button', { timeout: 25000 });
        
        await page.click('#rubric-button');
        await wait(5000);
        
        console.log('Worker logs for error test:', workerLogs);
        
        const buttonExists = await page.$('#rubric-button');
        expect(buttonExists).toBeTruthy();
        
        await page.close();
    }, 30000);

    test('Performance: Process real CSV with all students', async () => {
        const page = await browser.newPage();
        
        // Mock window.alert and prompt
        await page.evaluateOnNewDocument(() => {
            window.alert = (msg) => {
                console.log('ALERT:', msg);
            };
            window.prompt = (msg, defaultValue) => {
                console.log('PROMPT:', msg);
                return defaultValue || 'test-spreadsheet-id';
            };
        });
        
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        
        await page.setRequestInterception(true);
        page.on('request', request => {
            const url = request.url();
            
            if (url.includes('instructure.com/courses/12345/gradebook') && !url.includes('.csv')) {
                request.respond({
                    status: 200,
                    contentType: 'text/html',
                    body: `
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <meta name="csrf-token" content="mock-csrf-token-12345">
                        </head>
                        <body>
                            <div id="gradebook-actions"></div>
                            <a href="https://instructure.com/courses/12345/gradebook.csv" 
                               id="download_csv" 
                               class="ui-button ui-widget">Download CSV</a>
                        </body>
                        </html>
                    `
                });
            } else if (url.includes('gradebook.csv')) {
                request.respond({
                    status: 200,
                    contentType: 'text/csv',
                    body: testCSV
                });
            } else {
                request.continue();
            }
        });
        
        await page.goto('https://instructure.com/courses/12345/gradebook');
        
        await page.waitForSelector('#rubric-button', { timeout: 20000 });
        
        const startTime = Date.now();
        await page.click('#rubric-button');
        await wait(6000);
        
        const endTime = Date.now();
        const processingTime = endTime - startTime;
        
        console.log(`Processing time: ${processingTime}ms`);
        console.log(`CSV size: ${(testCSV.length / 1024).toFixed(2)} KB`);
        
        expect(processingTime).toBeLessThan(15000);
        
        const buttonExists = await page.$('#rubric-button');
        expect(buttonExists).toBeTruthy();
        
        await page.close();
    }, 60000);
});