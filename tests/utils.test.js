import path from 'path';
import { sortData, copySpreadsheet, formatRubrics } from '../src/backgroundUtils.js';
import fs from 'fs';


describe('Unit Tests for background utility functions', () => {
    let testCSV;

    beforeAll(() => {
        // Load the test CSV file
        const csvPath = path.join(process.cwd(), 'public/data/betterTestRubric.csv');
        testCSV = fs.readFileSync(csvPath, 'utf-8');
    });

    test("sortData properly parses real CSV and returns correct format", () => {
        const result = sortData(testCSV);
        
        expect(result.studentData).toBeDefined();
        expect(result.standardData).toBeDefined();
        expect(result.studentData.length).toBeGreaterThan(0);
        expect(result.standardData.length).toBeGreaterThan(0);
        expect(typeof result.studentData[0][0]).toBe('string'); // Name
        expect(typeof result.studentData[0][1]).toBe('object'); // Dictionary
    });

    test("copySpreadsheet with mocked chrome.identity", async () => {
        // Mock chrome.identity for this test
        const mockChrome = {
            identity: {
                getAuthToken: jest.fn((options, callback) => {
                    callback('mock_token_12345');
                })
            },
            runtime: {
                lastError: null
            }
        };
        
        // Mock fetch
        const mockFetch = jest.fn(() => 
            Promise.resolve({
                ok: true,
                json: () => Promise.resolve({ 
                    id: 'new_mock_sheet_id_123',
                    name: 'Test Rubric Copy'
                })
            })
        );
        
        // Temporarily replace global objects
        const originalChrome = global.chrome;
        const originalFetch = global.fetch;
        
        global.chrome = mockChrome;
        global.fetch = mockFetch;
        
        try {
            const result = await copySpreadsheet('original_sheet_id', 'Test Rubric Copy');
            expect(result).toBe('new_mock_sheet_id_123');
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining('googleapis.com/drive'),
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer mock_token_12345'
                    })
                })
            );
        } finally {
            // Restore original objects
            global.chrome = originalChrome;
            global.fetch = originalFetch;
        }
    });

    test("formatRubrics with mocked APIs", async () => {
        const mockStandards = ['Standard 1', 'Standard 2'];
        const mockStudentData = [
            ['John Doe (12345)', { 'Standard 1': '4', 'Standard 2': '3' }],
            ['Jane Smith (67890)', { 'Standard 1': '3', 'Standard 2': '4' }]
        ];
        
        // Mock chrome.identity
        const mockChrome = {
            identity: {
                getAuthToken: jest.fn((options, callback) => {
                    callback('mock_token_12345');
                })
            },
            runtime: {
                lastError: null
            }
        };
        
        // Mock fetch for ALL Google Sheets API calls
        const mockFetch = jest.fn((url, options) => {
            const method = options?.method || 'GET';
            
            // Mock getDataBounds - readRange call
            if (url.includes('/values/') && url.includes('Sheet1!A1') && method === 'GET') {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        values: [
                            ['Header1', 'Standard 1', 'Standard 2'],
                            ['Student1', '100', '75']
                        ]
                    })
                });
            }
            
            // Mock getCellsWithFormatting - includes includeGridData
            if (url.includes('includeGridData=true') && method === 'GET') {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        sheets: [{ 
                            properties: { title: 'Sheet1', sheetId: 0 },
                            data: [{
                                startRow: 0,
                                startColumn: 0,
                                rowData: [
                                    {
                                        values: [
                                            { 
                                                formattedValue: 'Standard 1',
                                                effectiveFormat: { textFormat: { bold: false } }
                                            }
                                        ]
                                    }
                                ]
                            }]
                        }]
                    })
                });
            }
            
            // Mock getSpreadsheetInfo
            if (url.endsWith('/spreadsheets/mock_sheet_id') && method === 'GET') {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        sheets: [
                            { properties: { title: 'Sheet1', sheetId: 0, index: 0 } }
                        ]
                    })
                });
            }
            
            // Mock duplicateSheet
            if (url.includes(':batchUpdate') && method === 'POST') {
                const body = JSON.parse(options.body);
                if (body.requests?.[0]?.duplicateSheet) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({
                            replies: [{
                                duplicateSheet: {
                                    properties: {
                                        sheetId: Math.random(),
                                        title: body.requests[0].duplicateSheet.newSheetName,
                                        index: 1
                                    }
                                }
                            }]
                        })
                    });
                }
                
                // Mock batchUpdate for writing values
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ 
                        replies: [],
                        spreadsheetId: 'mock_sheet_id'
                    })
                });
            }
            
            console.log('Unmocked URL:', url, 'Method:', method);
            return Promise.reject(new Error(`Unmocked API call: ${url}`));
        });
        
        // Temporarily replace global objects
        const originalChrome = global.chrome;
        const originalFetch = global.fetch;
        
        global.chrome = mockChrome;
        global.fetch = mockFetch;
        
        try {
            const result = await formatRubrics(mockStandards, mockStudentData, 'mock_sheet_id');
            expect(result).toContain('https://docs.google.com/spreadsheets/d/mock_sheet_id/edit');
            expect(mockFetch).toHaveBeenCalled();
        } finally {
            // Restore original objects
            global.chrome = originalChrome;
            global.fetch = originalFetch;
        }
    });
});