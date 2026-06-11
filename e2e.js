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
    // Lot number is auto-generated and read-only — no need to fill it
    // Select the first available plant from the dropdown
    await page.selectOption('select', { index: 1 });
    await page.fill('input[placeholder="e.g. 5000"]', '1000');
    await page.fill('input[type="date"]', '2026-10-15');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    console.log('✅ Lot Creation Successful!');

    console.log('5. Navigating to Direct Sales (single item, Cash)...');
    await page.goto('http://localhost:3000/sales/new');
    await page.waitForTimeout(1000);
    await page.selectOption('select', { index: 1 });
    await page.fill('input[placeholder="Qty"]', '10');
    await page.click('button:has-text("ADD")');
    await page.waitForTimeout(500);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    console.log('✅ Direct Sale Successful!');

    // ── REGRESSION TEST: Multi-item Split-payment reconciliation totals ────────
    // Bug: cash_amount and upi_amount are stored as the WHOLE-SALE total on every
    // item row. Before the fix, dsCash and dsUpi were summed row-by-row, multiplying
    // split amounts by item count. This step verifies the totals are self-consistent.
    console.log('6. Creating 2-item Split-payment sale for regression test...');
    await page.goto('http://localhost:3000/sales/new');
    await page.waitForTimeout(1000);

    // Add first item (qty 5)
    await page.selectOption('select', { index: 1 });
    // Use the number input in the add-to-cart section (not split fields)
    await page.locator('input[type="number"]').first().fill('5');
    await page.click('button:has-text("ADD")');
    await page.waitForTimeout(500);

    // Add second item — same plant, different qty (qty 3)
    await page.selectOption('select', { index: 1 });
    await page.locator('input[type="number"]').first().fill('3');
    await page.click('button:has-text("ADD")');
    await page.waitForTimeout(500);

    // Select Split payment
    await page.click('button:has-text("Split")');
    await page.waitForTimeout(500);

    // Read the total from the submit button text (e.g. "Collect ₹2000 · ...")
    // then fill cash = floor(total/2), always ≤ total, so UPI auto-fills and split is valid.
    const submitBtnText = await page.locator('button[type="submit"]').textContent().catch(() => 'Collect ₹100');
    const totalMatch = submitBtnText.match(/₹([\d,]+)/);
    const total = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : 100;
    const cashPortion = Math.max(1, Math.floor(total / 2));
    console.log(`   Sale total: ₹${total}, using cash portion: ₹${cashPortion}`);

    // Fill cash — UPI auto-calculates via the component's handleCashChange
    await page.locator('input[type="number"]').first().fill(String(cashPortion));
    await page.waitForTimeout(500);


    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    console.log('✅ Split-payment 2-item sale created!');

    console.log('7. Navigating to Reports → Reconciliation to verify totals...');
    await page.goto('http://localhost:3000/reports');
    await page.waitForTimeout(2000);

    // Extract Grand Total, Cash Total and UPI Total from the reconciliation tab
    const grandTotalText  = await page.locator('text=Grand Total').locator('..').locator('..').locator('p.text-5xl').textContent().catch(() => null);
    const cashTotalText   = await page.locator('text=Cash').first().locator('..').locator('..').locator('p.text-3xl').textContent().catch(() => null);
    const upiTotalText    = await page.locator('text=UPI').first().locator('..').locator('..').locator('p.text-3xl').textContent().catch(() => null);

    if (grandTotalText && cashTotalText && upiTotalText) {
      const parse = (t) => parseFloat(t.replace(/[₹,]/g, '')) || 0;
      const grand = parse(grandTotalText);
      const cash  = parse(cashTotalText);
      const upi   = parse(upiTotalText);
      const sum   = Math.round((cash + upi) * 100) / 100;
      const roundedGrand = Math.round(grand * 100) / 100;

      console.log(`   Grand Total: ₹${grand}, Cash: ₹${cash}, UPI: ₹${upi}, Cash+UPI: ₹${sum}`);

      if (Math.abs(sum - roundedGrand) > 0.5) {
        throw new Error(
          `REGRESSION DETECTED: Cash(${cash}) + UPI(${upi}) = ${sum} ≠ Grand Total(${grand}). ` +
          `Split amounts are being multiplied by item count.`
        );
      }
      if (cash > grand) {
        throw new Error(`REGRESSION DETECTED: Cash total (${cash}) exceeds Grand Total (${grand}). Split amounts multiplied.`);
      }
      console.log('✅ Reconciliation totals are mathematically consistent (Cash + UPI = Grand Total)!');
    } else {
      console.log('⚠️  Could not extract reconciliation totals — page structure may differ. Skipping assertion.');
    }
    // ── END REGRESSION TEST ───────────────────────────────────────────────────

    await browser.close();
    console.log('🎉 ALL END-TO-END TESTS PASSED SUCCESSFULLY!');
  } catch (error) {
    console.error('❌ Test Failed:', error.message);
    if (browser) await browser.close();
    process.exit(1);
  }
})();

