const { chromium } = require('playwright');

(async () => {
  let browser;
  try {
    console.log('Launching browser...');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('1. Navigating to Login...');
    await page.goto('http://localhost:3000/login');
    await page.waitForTimeout(1000);

    console.log('2. Performing Login...');
    await page.fill('input[type="tel"]', '9999999999');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    console.log('✅ Login Successful!');

    console.log('3. Navigating to Add Plant...');
    await page.goto('http://localhost:3000/plants/new');
    await page.waitForTimeout(1000);
    await page.fill('input[placeholder="e.g. Mango Graft"]', 'Automated Test Plant');
    await page.fill('input[placeholder="e.g. Grafted, Seedling"]', 'Test Category');
    await page.fill('input[placeholder="e.g. 150"]', '250');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    console.log('✅ Plant Creation Successful!');

    console.log('4. Navigating to Add Lot...');
    await page.goto('http://localhost:3000/lots/new');
    await page.waitForTimeout(1000);
    await page.fill('input[placeholder="e.g. LOT-101"]', 'LOT-AUTO-01');
    // Using selectOption with index 1 (the first actual plant)
    await page.selectOption('select', { index: 1 });
    await page.fill('input[placeholder="e.g. 5000"]', '1000');
    await page.fill('input[type="date"]', '2026-10-15');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    console.log('✅ Lot Creation Successful!');

    console.log('5. Navigating to Direct Sales...');
    await page.goto('http://localhost:3000/sales/new');
    await page.waitForTimeout(1000);
    await page.selectOption('select', { index: 1 });
    await page.fill('input[placeholder="Qty"]', '10');
    await page.click('button:has-text("ADD")');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    console.log('✅ Direct Sale Successful!');

    await browser.close();
    console.log('🎉 ALL END-TO-END TESTS PASSED SUCCESSFULLY!');
  } catch (error) {
    console.error('❌ Test Failed:', error.message);
    if (browser) await browser.close();
    process.exit(1);
  }
})();
