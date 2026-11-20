import { chromium } from 'playwright';
import assert from 'node:assert/strict';
(async () => {
  const browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || undefined,
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on('pageerror', (e) => {
      errors.push(e.message);
      console.error('page error', e.message);
    });
    page.on('response', (r) => {
      if (r.status() >= 400 && r.url().includes('/api/'))
        console.error('HTTP', r.status(), new URL(r.url()).pathname);
    });
    const click = (label) => page.getByRole('button', { name: label, exact: true }).click();
    const state = () => page.evaluate(async () => (await fetch('/api/workspace')).json());
    const nav = (label) =>
      page.locator('nav').getByRole('button', { name: label, exact: true }).click();
    await page.goto(process.env.CFO_URL || 'http://127.0.0.1:8080', { waitUntil: 'networkidle' });
    await page.getByText('€10,843.69', { exact: true }).waitFor();
    assert.equal(await page.getByText('System health', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Liquidity decision', { exact: true }).count(), 0);
    await page.locator('.chart-alert').filter({ hasText: 'First below zero' }).waitFor();
    assert.equal(await page.locator('.recharts-reference-area').count(), 0);
    await nav('Transactions');
    await page.getByText(/507 of 1125 imported payments/).waitFor();
    await nav('Liquidity Agent');
    await click('Last statement date');
    await click('Run forecast');
    await nav('Transactions');
    await page.getByText(/1125 of 1125 imported payments/).waitFor();
    await nav('Liquidity Agent');
    await page.getByLabel('Cut-off date', { exact: true }).fill('2025-05-31');
    await click('Run forecast');
    const risk = page.locator('section.card').filter({ hasText: 'Payments at risk' }).last();
    await risk.locator('tbody .payment-bar').first().waitFor();
    await page.getByRole('columnheader', { name: 'Source' }).waitFor();
    await click('Run liquidity agent');
    assert(await page.getByRole('button', { name: 'Regenerate decision' }).isDisabled());
    await click('Approve (simulation)');
    await page.getByText(/simulated\s*· Request/).waitFor();
    await page.locator('summary', { hasText: 'Compare cash balances' }).click();
    await click('Compare scenarios');
    await page.getByText(/Principal outstanding at horizon end/).waitFor();
    await page.reload();
    await nav('Liquidity Agent');
    await page.getByText(/simulated\s*· Request/).waitFor();
    console.log('credit proposal, approval, cash scenario, reload verified');
    await nav('Liquidity Agent');
    await page.getByLabel('Opening balance before first booking (€)').fill('25000');
    await click('Run forecast');
    await page.getByText(/Minimum €11,656.31/).waitFor();
    await nav('Investment Agent');
    await click('Run investment agent');
    await page.getByText(/Term deposit ·/).waitFor();
    await click('Reject');
    await page.locator('.badge', { hasText: 'rejected' }).waitFor();
    async function simulate(title, amount, rate) {
      const card = page
        .locator('section')
        .filter({ has: page.locator('.card-title', { hasText: title }) })
        .last();
      await card.getByLabel(/Scenario amount/).fill(amount);
      if (rate) await card.getByLabel('Assumed EUR per CHF').fill(rate);
      await card.getByRole('button', { name: /^Review / }).click();
      await click('Cancel');
      await card.getByRole('button', { name: /^Review / }).click();
      await click('Approve simulation');
      await card.getByText(/Simulated #/).waitFor();
    }
    await simulate('Money market enquiry', '500');
    await simulate('Equipment finance enquiry', '1500');
    await nav('Currency Exposure');
    await simulate('CHF forward simulation', '1000', '1.0425');
    await nav('Tax Payments');
    await simulate('Adjusted tax prepayment', '300');
    console.log('investment, rejection, money market, capex, FX, tax verified');
    await nav('Transactions');
    await click('Show more payments');
    const row = page.locator('tbody tr').first();
    await row.getByRole('button').click();
    await page.getByLabel(/Category for row/).fill('UI test category');
    await click('Save category');
    await page.getByRole('button', { name: 'UI test category', exact: true }).waitFor();
    await page.getByLabel('Category', { exact: true }).selectOption('UI test category');
    await page.getByText('Account activity · 1 payments').waitFor();
    const s = await state();
    assert.equal(s.simulations.length, 4);
    assert.equal(s.assessments.investment.status, 'rejected');
    assert(s.audit.some((x) => x.kind === 'liquidity' && x.event === 'simulated'));
    await nav('Liquidity Agent');
    await page.locator('summary', { hasText: 'Import CSV files' }).click();
    async function csv(label, content) {
      await page.getByLabel(label, { exact: true }).setInputFiles({
        name: 'example.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(content),
      });
    }
    await csv(
      'Bank statement',
      'Account Number;Booking Date;Value Date;Transaction Type;Payment Reference;Amount;Currency;Info\nDE-TEST;01.05.25;01.05.25;SUPPLIER PAYMENT;Supplier;-25,00;EUR;Transaction booked',
    );
    await csv(
      'Cash flow plan',
      'date,category,amount_eur,description\n2025-06-05,payroll,-100,Wages',
    );
    await csv(
      'Invoices',
      'invoice_id;counterparty;issued_on;due_on;amount_eur\nDEMO-INV;Supplier;2025-05-01;2025-05-01;-25.00',
    );
    await click('Run forecast');
    await page.getByText(/Resolve the invoice matches/).waitFor();
    await nav('Transactions');
    await page.getByLabel('Match invoice DEMO-INV', { exact: true }).selectOption('2');
    await click('Confirm match');
    await page.getByText('DEMO-INV · Settled by statement row 2').waitFor();
    console.log('three CSV uploads, ambiguous match and confirmed settlement verified');
    await nav('Dashboard');
    await page.setViewportSize({ width: 390, height: 844 });
    await nav('Currency Exposure');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    assert.deepEqual(errors, []);
    console.log('transaction drill-down, persistent audit and mobile verified');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
