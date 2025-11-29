import puppeteer from 'puppeteer';
import path from 'path';
describe('Chrome Extension Tests', () => {
  let browser;

  beforeAll(async () => {
    const pathToExtension = path.join(process.cwd(), 'Extension');
    browser = await puppeteer.launch({
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  test('Service worker loads correctly', async () => {
    const workerTarget = await browser.waitForTarget(
      target =>
        target.type() === 'service_worker' &&
        target.url().endsWith('background.js'),
    );
    const worker = await workerTarget.worker();
    expect(worker).toBeDefined();
  });

  test('Button loads on canvas gradebook', async () => {
    const page = await browser.newPage();

    // Navigate to a fake Canvas URL that will trigger the extension
    await page.goto('https://instructure.com/courses/12345/gradebook', {
      waitUntil: 'domcontentloaded'
    });

    // Set our test content after navigation
    await page.setContent(`
      <html>
        <head>
          <title>Canvas Gradebook</title>
        </head>
        <body>
          <div id="gradebook-actions">
            <!-- Button should ideally be here-->
          </div>
        </body>
      </html>
    `);

    // Wait for the button to be created by the extension
    await page.waitForSelector('#rubric-button', { 
      timeout: 15000,
      visible: true 
    });

    const button = await page.$('#rubric-button');
    expect(button).toBeTruthy();

    const buttonText = await page.$eval('#rubric-button', el => el.textContent);
    expect(buttonText).toContain('Format The Rubrics!');

    await page.close();
  });
});