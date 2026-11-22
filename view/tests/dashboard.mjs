import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { exerciseAccount } from './account.mjs';
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
    const deleteTestAccount = await exerciseAccount(page);
    const fresh = await state();
    assert.equal(fresh.statement_rows.length, 0);
    const statement = await readFile(new URL('../../data/sample/pizzeria-amalfi-2025.csv', import.meta.url), 'utf8');
    const seeded = await page.request.post('/api/forecast', {
      headers: {'X-CFO-Client': 'dashboard'},
      data: {revision: fresh.revision, settings: {...fresh.settings, as_of: '2025-05-31', starting_balance: '2500.00'}, statement},
    });
    assert(seeded.ok());
    await page.reload();
    const assistant = page.locator('.snail-chat');
    await assistant.getByRole('textbox').fill('Can I buy equipment for 6000 EUR?');
    await page.locator('.sidebar.chat-open').waitFor();
    await assistant.getByRole('button', {name:'Send'}).click();
    await assistant.getByText(/Credit needed/).waitFor();
    await nav('Data');
    assert.equal(await page.locator('.sidebar.chat-open').count(), 0);
    assert.equal(await page.locator('.snail-chat.tall').count(), 1);
    async function runForecast() {
      const refreshed = page.waitForResponse((r) => r.url().endsWith('/api/workspace') && r.ok());
      await click('Run forecast');
      await (await refreshed).finished();
      await page.getByRole('button', { name: 'Run forecast', exact: true }).waitFor();
    }
    async function setOpeningBalance(value) {
      await nav('Data');
      await page.getByLabel('Opening balance before first booking (€)').fill(value);
      const refreshed = page.waitForResponse(r => r.url().endsWith('/api/workspace') && r.ok());
      await click('Save');
      await (await refreshed).finished();
    }
    await setOpeningBalance('0');
    await nav('Dashboard');
    assert.equal(await page.getByText('Workspace audit', {exact:true}).count(), 0);
    const trends = page.locator('.trend-scroll tbody tr');
    assert.equal(await trends.count(), 5);
    await page.getByRole('button', {name:/Show more/}).click();
    assert((await trends.count()) > 5);
    await page.getByRole('button', {name:/Show fewer/}).click();
    await click('3 months');
    await page.getByText(/Expected receipts minus planned payments through/).waitFor();
    await page.getByText('€4,671.61', { exact: true }).first().waitFor();
    assert.equal(await page.getByText('System health', { exact: true }).count(), 0);
    assert.equal(await page.getByText('Liquidity decision', { exact: true }).count(), 0);
    await page.locator('.chart-alert').filter({ hasText: 'First below zero' }).first().waitFor();
    assert.equal(await page.locator('.recharts-reference-area').count(), 0);
    await nav('Transactions');
    assert.equal(await page.getByLabel('Chart start date').inputValue(), '2025-12-01');
    for (const name of ['Simulations', 'Investment Agent', 'Tax Payments', 'Currency Exposure']) {
      assert.equal(await page.getByRole('button', { name, exact: true }).count(), 0);
    }
    await click('Deutsch');
    await click('Glossar');
    await page.getByText('Fähigkeit, Zahlungsverpflichtungen bei Fälligkeit zu erfüllen.', {exact:true}).waitFor();
    await click('Schließen');
    await nav('Einstellungen');
    await page.getByRole('option', { name: 'EUR' }).waitFor({state:'attached'});
    await nav('Liquiditätsagent');
    const scenario = page.getByRole('heading', {name: 'Operatives Liquiditätsszenario'});
    await scenario.waitFor();
    const chart = page.getByRole('heading', { name: 'Liquiditätsprognose', exact: true });
    assert(await chart.evaluate((el, next) => Boolean(el.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING), await scenario.elementHandle()));
    const categories = page.getByLabel('Kategorie hinzufügen');
    const rent = await categories.locator('option').evaluateAll(options => options.find(o => /rent/i.test(o.value))?.value);
    assert(rent);
    await categories.selectOption(rent);
    await page.getByLabel('Betragsänderung (%)').fill('-25');
    await page.getByText('Kontostand im Szenario', {exact:true}).waitFor();
    await click('English');
    await click('Last statement date');
    await runForecast();
    await nav('Transactions');
    await click('Full statement');
    await page.getByText(/1125 matching payments/).waitFor();
    await nav('Liquidity Agent');
    await page.getByLabel('Cut-off date', { exact: true }).fill('2025-05-31');
    await runForecast();
    const risk = page.locator('section.card').filter({ hasText: 'Payments at risk' }).last();
    await risk.locator('tbody .payment-bar').first().waitFor();
    await page.getByRole('columnheader', { name: 'Source' }).waitFor();
    await click('Run liquidity agent');
    assert.equal(await page.getByRole('button', { name: 'Regenerate decision' }).count(), 0);
    const decision = page.locator('.rec-block');
    await decision.getByRole('heading', { name: /Bridge credit line/ }).waitFor();
    assert.equal(await decision.getByText(/^(pending|Reject|Approve \(simulation\)|Compare cash balances)$/i).count(), 0);
    await page.reload();
    await nav('Liquidity Agent');
    await decision.getByRole('heading', { name: /Bridge credit line/ }).waitFor();
    await setOpeningBalance('25000');
    assert.equal((await state()).analysis.forecast.minimum_balance, '20328.39');
    await nav('Transactions');
    await click('Next 50');
    await page.getByText(/Page 2 of/).waitFor();
    assert.equal(await page.locator('tbody tr').count(), 50);
    await click('Previous 50');
    await click('Last month');
    assert.equal(await page.getByLabel('Chart start date').inputValue(), '2025-12-01');
    await click('Full statement');
    assert.equal(await page.getByLabel('Chart end date').inputValue(), '2025-12-31');
    await page.getByLabel('Chart end date').fill('2025-05-31');
    const row = page
      .locator('tbody tr')
      .filter({ has: page.locator('button:enabled') })
      .first();
    await row.locator('.transaction-category').click();
    await page.getByLabel(/Category for row/).fill('UI test category');
    await click('Save category');
    await page.getByRole('button', { name: 'UI test category', exact: true }).waitFor();
    await page.getByLabel('Category', { exact: true }).selectOption('UI test category');
    await page.getByText('Account activity · 1 payments').waitFor();
    const s = await state();
    assert(s.audit.some((x) => x.kind === 'liquidity' && x.event === 'simulated'));
    await nav('Data');
    async function csv(label, content) {
      await page.getByLabel(label, { exact: true }).setInputFiles({
        name: 'example.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(content),
      });
      const panel = page.locator('.data-panel').filter({has:page.getByRole('heading',{name:label, exact:true})});
      await panel.getByRole('button',{name:/Replace dataset|Import dataset/}).click();
      await panel.getByText('Imported. Forecast updated.').waitFor();
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
    await nav('Liquidity Agent');
    await runForecast();
    await page.getByText(/Check ambiguous invoice references/).waitFor();
    await nav('Transactions');
    assert.equal(await page.getByText('Invoice reconciliation', {exact:true}).count(), 0);
    await nav('Dashboard');
    await page.setViewportSize({ width: 390, height: 844 });
    await nav('Settings');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await deleteTestAccount();
    assert.deepEqual(errors, []);
    console.log('transaction drill-down, persistent audit and mobile verified');
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
