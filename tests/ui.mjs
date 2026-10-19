import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import './fixtures.mjs';
import {classificationValue,parseCSV} from '../src/core.js';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-first-run','--disable-background-networking']});
const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const nav=async view=>page.locator(`.sidebar [data-view="${view}"]`).click();
const action=async name=>page.locator(`[data-action="${name}"]`).first().click();
const input=name=>page.locator(`#modal [name="${name}"]`);
const save=async()=>{await page.locator('#modal [type=submit]').click();await page.locator('#modal').waitFor({state:'hidden'});};
let checks=0;const check=label=>{checks++;console.log('PASS',label);};
try {
  await page.goto('http://127.0.0.1:4173/');
  await page.locator('#auth-form [name=password]').fill('0042');
  await page.locator('#auth-form [name=confirm]').fill('0042');
  await page.locator('#auth-form [name=recovery]').fill('A private test password 2026');await page.locator('#auth-form [name=recoveryConfirm]').fill('A private test password 2026');
  await page.locator('#auth-form [type=submit]').click();
  await page.locator('.sidebar').waitFor();check('create encrypted vault');

  await nav('categories');
  const chooserPromise=page.waitForEvent('filechooser');await action('import-categories');
  await (await chooserPromise).setFiles('samples/categories.csv');
  await page.getByRole('heading',{name:'Review your categories'}).waitFor();await save();
  assert.ok((await page.locator('.category-grid').textContent()).includes('Travel & holidays'));check('category upload and custom type creation');

  await nav('transactions');await action('add-transaction');
  await input('description').fill('Swiss groceries');await input('date').fill('2026-10-08');await input('currency').selectOption('CHF');
  assert.equal(await input('categoryId').inputValue(),'');assert.equal(await input('subcategory').inputValue(),'');
  await input('subcategory').selectOption(classificationValue('home','Rent'));assert.equal(await input('categoryId').inputValue(),'home');
  await input('subcategory').selectOption(classificationValue('food','Groceries'));assert.equal(await input('categoryId').inputValue(),'food');
  assert.deepEqual(await page.locator('.amount-fields input').evaluateAll(inputs=>inputs.map(i=>i.name)),['debit','final','credit']);
  await input('debit').fill('100');await input('credit').fill('20');await input('final').fill('75');await save();
  assert.ok(!(await page.locator('.content').textContent()).includes('Swiss groceries'));
  await page.locator('#currency-select').selectOption('CHF');await page.getByText('Swiss groceries',{exact:true}).waitFor();
  assert.ok((await page.locator('tbody').textContent()).includes('75.00'));
  assert.deepEqual((await page.locator('thead th').allTextContents()).filter(h=>['Debit','Final debit','Credit'].includes(h)),['Debit','Final debit','Credit']);
  assert.deepEqual((await page.locator('tbody tr:first-child td.numeric').allTextContents()).map(s=>s.replace(/\s/g,' ')),['CHF 100.00','CHF 75.00','CHF 20.00']);
  await action('edit-transaction');assert.equal(await input('subcategory').inputValue(),classificationValue('food','Groceries'));assert.equal(await input('categoryId').inputValue(),'food');assert.equal(await input('final').inputValue(),'75.00');await save();
  check('subcategory-driven parent, CHF adjustment, edit persistence and Debit / Final debit / Credit order');
  await page.locator('#currency-select').selectOption('USD');await page.getByRole('heading',{name:'A fresh start'}).waitFor();
  await action('add-transaction');await input('description').fill('USD payment');await input('credit').fill('125');await input('subcategory').selectOption(classificationValue('pay','Monthly pay'));await save();await page.getByText('USD payment',{exact:true}).waitFor();
  await page.locator('#currency-select').selectOption('INR');await nav('imports');
  await page.locator('#statement-file').setInputFiles('samples/statement.csv');
  await page.locator('#map-form').waitFor();await page.locator('#map-form [type=submit]').click();
  await page.locator('.review').waitFor();assert.equal(await page.locator('.review tbody tr').count(),6);
  assert.deepEqual((await page.locator('.review thead th').allTextContents()).filter(h=>['Debit','Final debit','Credit'].includes(h)),['Debit','Final debit','Credit']);
  await page.locator('[data-review="2"][data-field="subcategory"]').selectOption(classificationValue('home','Rent'));
  assert.equal(await page.getByRole('combobox',{name:'Main category row 3',exact:true}).inputValue(),'home');
  await page.locator('[data-review="2"][data-field="subcategory"]').selectOption(classificationValue('food','Groceries'));
  assert.equal(await page.getByRole('combobox',{name:'Main category row 3',exact:true}).inputValue(),'food');
  await page.locator('[data-review="2"][data-field="final"]').fill('2400');await page.locator('[data-review="2"][data-field="final"]').press('Tab');
  await action('finalize-import');await page.getByRole('heading',{name:'Your transactions'}).waitFor();
  assert.ok((await page.locator('tbody').textContent()).includes('2,400.00'));check('CSV mapping, editable review, finalized adjustment');

  await nav('imports');await page.locator('#statement-file').setInputFiles('samples/statement.csv');await page.locator('#map-form [type=submit]').click();await page.locator('.review').waitFor();
  assert.equal(await page.locator('.review input[type=checkbox]:checked').count(),0);check('duplicate rows excluded on repeat import');await action('reset-import');

  await page.locator('#statement-file').setInputFiles('test-results/fixtures/statement.xlsx');await page.locator('#map-form').waitFor();await page.locator('#map-form [type=submit]').click();
  await page.locator('.review').waitFor();assert.equal(await page.locator('.review').count(),1);
  await page.locator('[data-review="0"][data-field="subcategory"]').selectOption(classificationValue('food','Groceries'));
  await page.locator('[data-review="1"][data-field="subcategory"]').selectOption(classificationValue('food','Groceries'));
  assert.equal(await page.locator('.review tbody tr').count(),2);assert.equal(await page.locator('[data-review="1"][data-field="credit"]').inputValue(),'150.00');await action('finalize-import');check('Excel XLSX import, numeric cells and credits');

  await nav('imports');await page.locator('#statement-file').setInputFiles('test-results/fixtures/statement.pdf');await page.locator('#map-form').waitFor({timeout:30000});
  console.log('PDF extracted:',await page.locator('#pdf-raw').inputValue());
  await page.locator('#map-form [name=defaultSubcategory]').selectOption(classificationValue('food','Groceries'));await page.locator('#map-form [type=submit]').click();await page.locator('.review').waitFor();
  assert.equal(await page.locator('.review tbody tr').count(),2);assert.equal(await page.locator('[data-review="0"][data-field="debit"]').inputValue(),'450.00');assert.equal(await page.locator('[data-review="1"][data-field="credit"]').inputValue(),'50.00');
  await action('finalize-import');check('PDF local WASM extraction and empty debit/credit alignment');

  await nav('reports');await action('add-report');await input('name').fill('Food by month');await input('type').selectOption('pivot');await input('column').selectOption('month');await input('measure').selectOption('final');await page.locator('#modal [name=categories][value=food]').check();await save();
  await page.getByRole('heading',{name:'Food by month'}).waitFor();assert.ok((await page.locator('.report-card').textContent()).includes('Grand total'));await action('copy-report');await page.waitForFunction(()=>document.querySelectorAll('.report-card').length===2);check('configurable pivots and duplicate reports');

  await nav('budgets');await action('add-budget');await input('categoryId').selectOption('food');await input('period').fill('2026-10');await input('amount').fill('5000');await save();
  await action('add-budget');await input('categoryId').selectOption('food');await input('period').fill('2026');await input('amount').fill('60000');await page.locator('#modal [type=submit]').click();await page.getByText(/already has an overlapping plan/).waitFor();await action('close-modal');
  await action('add-budget');await input('categoryId').selectOption('food');await input('period').fill('2025-10');await input('amount').fill('4000');await save();
  await action('budget-year');assert.ok((await page.locator('.content').textContent()).includes('2025 planned'));check('yearly history, comparisons and overlapping-plan protection');

  await nav('timeline');await action('add-family');await input('name').fill('Me');await input('birthDate').fill('1990-05-12');await save();
  await action('add-family');await input('name').fill('My wife');await input('birthDate').fill('1992-10-12');await save();
  await action('add-milestone');await input('name').fill('Our future home');await input('date').fill('2030-06-01');await input('target').fill('2500000');await input('saved').fill('500000');await input('monthly').fill('25000');await input('rate').fill('6');await input('inflation').fill('4');await save();
  assert.ok((await page.locator('.timeline-cards').textContent()).includes('Me · 40'));check('family ages and dated money timeline projections');

  await nav('settings');
  const csvDownload=page.waitForEvent('download');await action('export-all');const csv=await csvDownload;await csv.saveAs('test-results/all-transactions.csv');
  const exported=await fs.readFile('test-results/all-transactions.csv','utf8');assert.ok(exported.includes('"Currency"'));assert.ok(exported.includes('"CHF"'));assert.ok(exported.includes('"USD"'));assert.deepEqual(parseCSV(exported)[0].slice(-3),['Debit','Final debit','Credit']);check('all-currency CSV export with exactly three amount columns');
  const backupDownload=page.waitForEvent('download');await action('backup');const backup=await backupDownload;await backup.saveAs('test-results/ledger.pocketledger');
  const backupText=await fs.readFile('test-results/ledger.pocketledger','utf8');assert.ok(!backupText.includes('Swiss groceries'));assert.equal(JSON.parse(backupText).format,'PocketLedger');
  const stored=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('pocket-ledger-secure');r.onsuccess=()=>{const q=r.result.transaction('vault').objectStore('vault').get('primary');q.onsuccess=()=>resolve(JSON.stringify(q.result));q.onerror=()=>reject(q.error);};}));
  assert.ok(!stored.includes('Swiss groceries'));check('encrypted export and encrypted IndexedDB at rest');
  await page.reload();await page.locator('#auth-form').waitFor();assert.ok(!(await page.locator('body').textContent()).includes('Our future home'));
  await page.locator('#auth-form [name=password]').fill('9999');await page.locator('#auth-form [type=submit]').click();await page.getByText(/Incorrect PIN/).waitFor();
  await page.locator('#auth-form [name=password]').fill('0042');await page.locator('#auth-form [type=submit]').click();await page.locator('.sidebar').waitFor();await nav('settings');
  await action('change-password');await input('current').fill('A private test password 2026');await input('password').fill('New private password 2026');await input('confirm').fill('New private password 2026');await save();
  await page.reload();await page.locator('#auth-form [name=password]').fill('0042');await page.locator('#auth-form [type=submit]').click();await page.locator('.sidebar').waitFor();check('reload lock, wrong password rejection and password rotation');
  await nav('settings');const restoreChooser=page.waitForEvent('filechooser');await action('restore');await(await restoreChooser).setFiles('test-results/ledger.pocketledger');await page.getByRole('heading',{name:'Open your encrypted backup'}).waitFor();await input('credentialMode').selectOption('recovery');await input('password').fill('A private test password 2026');await page.locator('#modal [type=submit]').click();await page.getByRole('heading',{name:'Your backup is ready'}).waitFor();await save();
  await nav('timeline');assert.ok((await page.locator('.content').textContent()).includes('Our future home'));check('reviewed restore using original backup password');
  await page.evaluate(()=>window.pocketLedgerLock());await page.locator('#auth-form').waitFor();assert.equal(await page.locator('#modal').textContent(),'');check('manual/native lock clears plaintext UI and modal');
  assert.deepEqual(errors,[]);check('no JavaScript runtime errors');
  await fs.writeFile('test-results/ui-results.json',JSON.stringify({passed:true,date:new Date().toISOString(),checks,runtimeErrors:errors},null,2));
} catch(error) {
  await page.screenshot({path:'test-results/failure.png',fullPage:true});console.error('FAIL',error);console.log('Runtime errors:',errors);process.exitCode=1;
} finally {await browser.close();}
