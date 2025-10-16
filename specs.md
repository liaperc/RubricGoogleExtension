When the extension is installed, there will be a button on the canvas "grades" page

When that button is pressed, the extension should trigger the download feature of the "export all" button but intercept it before it completes

The extension will then ask the user for a link to a spreadsheet

Then it will ask for a name for the spreadsheet being created

Then it will parse the csv it intercepted and make a list of duples with studentname and a dictionary full of standards and scores

Then it will try to make a copy of the link given

In this copy it will look for rubric standards and their location

Then, for each student, it will make a new tab that is the same as the orginal tab, but place the score to the corresponding rubric standard to the left of where it was found.

Then the extension will open the spreadsheet.