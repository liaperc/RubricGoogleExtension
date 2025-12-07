# Canvas To Formatted Rubric Chrome Extension

## Description
On the "Grades" page of canvas a new button will appear. Upon pushing this button, the user will be prompted to provide a link to a google sheet. This google sheet should have an example rubric unfilled in. 
After providing the link, the user will then be prompted to provide a name for a new google sheet that will be the home of the formatted rubrics.

This extension will then parse the canvas CSV data and attempt to match it to the provided rubric for every student. 
After this is done, the chrome extension will open the new spreadsheet. This spreadsheet should have the example rubric on sheet1. The other tabs will be labeled by student names last, first. On those tabs should have the properly formatted rubrics for each student (rubric scores are always rounded to the nearest 10's place)


## How to set up the extension
#### 1. Instalation
You will need to install the extension from github. Then you will go to <u>chrome://extensions</u>, enable developer mode on the top right, and click load unpacked. Then navigate to where you stored the git download. 

#### 2. Google Cloud Requirements
To run the chrome extension properly, please contact me so I can add you as a tester to google cloud. This is only necessary because I have yet to publish/verify the extension.

#### 3. Updating/Testing the Extension
Everytime you save to VScode or wherever you are programming, you must press the reload button for the extension.

Note that console.logs from content.js will go into the webpages console (found by right clicking then inspecting), and background.js console.logs can be found by clicking "service worker" on chrome://extensions.

Additionally errors will be logged in chrome://extensions and won't refresh unless you clear them.


## How to Use the Extension
1. Make an example rubric format on google sheets. The rubric standards should be written exactly the same way they are on canvas and shouldn't be bolded. The score for the student (0-4) will be placed to the left of wherever the standard is written. ([Example](https://docs.google.com/spreadsheets/d/1WPnHicfWbOp67bHMF5PtqYro-7AVxnYd0Nyj5oOiZiI/edit?usp=sharing))
Should be fine so long as you have access.
2. Open the gradebook on canvas as a teacher
3. Click the "Format the Rubrics" button. (As of writing this it should be blue and next to export all)
4. Paste the link to the spreadsheet with the example format (will ocassionally request for you to sign into google)
5. Input desired name of formatted rubrics sheet.
6. Wait a little bit of time. (Took less than a minute with 3 students and 33 standards)
7. The sheet should now open
8. Once you are happy with the output, you can press the rubric icon to open a popup. Here you can press a button to download each sheet seperately as a pdf for better uploading to the nexus.

## Limitations
- Cannot be run on accounts either under 18 or designated by admin as under 18 due to sheets API requirements.
## Known Issues (in order of importance)
- Typos: Even the slightest difference between what canvas has and the example rubric has for standards can lead to errors.
- Misreading: Rubrics are often seperated by groups of standards. The title of this group can be misinterpreted as a standard in itself sometimes. My current workaround is ignoring bolded text.
- Specific Canvas Setup: This chrome extesnion only works for a specific canvas setup for grading that I was given.



