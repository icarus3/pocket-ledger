import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {newData} from '../src/core.js';
import {createVault,unlock} from '../src/vault.js';

// Run after npm run build, with the repository preview server on port 4173.
// PL_STRESS=1 also imports, saves and reopens 500,000 fictional rows.
const origin='http://127.0.0.1:4173';
const pin='0042',legacyPassword='Fictional planning test password';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-first-run','--disable-background-networking']});
const context=await browser.newContext({viewport:{width:1280,height:1000},acceptDownloads:true,hasTouch:true});
let page=await context.newPage();
const errors=[],checks=[],timings={};
const watch=()=>page.on('pageerror',error=>errors.push(error.message));watch();
const nav=async view=>{
  if(!await page.locator('.sidebar').isVisible())await page.locator('[data-action=menu]').click();
  await page.locator(`.sidebar [data-view="${view}"]`).click();
};
const action=name=>page.locator(`[data-action="${name}"]`).first().click();
const input=name=>page.locator(`#modal [name="${name}"]`);
const section=()=>page.locator('.content');
const check=label=>{checks.push(label);console.log('PASS',label);};
async function save(){
  await page.locator('#modal [type=submit]').click();
  try{await page.locator('#modal').waitFor({state:'hidden'});}catch(error){throw new Error((await page.locator('#modal .form-error').textContent())||error.message);}
}
async function stored(){
  return page.evaluate(()=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('pocket-ledger-secure');
    request.onsuccess=()=>{
      const database=request.result,query=database.transaction('vault').objectStore('vault').get('primary');
      query.onsuccess=()=>{
        const envelope=query.result,manifest=envelope?._ciphertextChunks;
        if(!manifest){resolve(envelope);database.close();return;}
        const store=database.transaction('vault').objectStore('vault'),chunks=new Array(manifest.count);
        let received=0;
        for(let index=0;index<manifest.count;index++){
          const chunk=store.get('primary:ciphertext:'+index);
          chunk.onerror=()=>reject(chunk.error);
          chunk.onsuccess=()=>{
            chunks[index]=chunk.result;
            if(++received===manifest.count){envelope.ciphertext=chunks.join('');delete envelope._ciphertextChunks;resolve(envelope);database.close();}
          };
        }
      };
      query.onerror=()=>reject(query.error);
    };
    request.onerror=()=>reject(request.error);
  }));
}
async function persisted(predicate,secret=pin){
  for(let retry=0;retry<30;retry++){
    const data=(await unlock(await stored(),secret)).data;
    if(predicate(data))return data;
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  throw new Error('Expected encrypted planning state was not persisted');
}
async function reopen(secret=pin){
  await page.close();page=await context.newPage();watch();
  await page.goto(origin);await page.locator('#auth-form [name=password]').fill(secret);
  await page.locator('#auth-form [type=submit]').click();await page.locator('.sidebar').waitFor();
}
async function fill(fields){for(const [name,value]of Object.entries(fields))await input(name).fill(String(value));}
async function addOption(group,name,parentId){
  const button=page.locator(`[data-action="planning-add-option"][data-id="${group}"]`);
  if(!await button.isVisible())await page.locator('.planning-options summary').click();
  await button.click();
  await input('name').fill(name);
  if(parentId)await input('parentId').selectOption(parentId);
  await save();
}
async function selectText(name,label){await input(name).selectOption({label});}
async function changePlanning(name,value){
  const control=page.locator(`[data-planning="${name}"]`);
  if(await control.evaluate(element=>element.tagName==='SELECT'))await control.selectOption(String(value));
  else{await control.fill(String(value));await control.press('Tab');}
}
function rowContaining(text){return page.locator('.content tbody tr').filter({hasText:text});}
const editRow=(row,kind)=>row.locator(`[data-action="planning-edit"][data-id^="${kind}:"]`).click();
async function importCSV(name,contents){
  const scale=name==='fictional-500000.csv';
  if(scale)console.log('STRESS opening import screen');
  await nav('imports');await page.locator('#statement-file').setInputFiles({name,mimeType:'text/csv',buffer:Buffer.from(contents)});
  if(scale)console.log('STRESS file selected; waiting for mapping');
  await page.locator('#map-form [type=submit]').click();
  if(scale)console.log('STRESS mapping submitted; waiting for paged review');
  await page.locator('.review').waitFor();
}

await fs.mkdir('test-results',{recursive:true});
try{
  // Seed the actual IndexedDB with a legacy envelope, then use the app to migrate it.
  const legacyData=newData();delete legacyData.planning;
  legacyData.transactions.push({id:'legacy-planning-test',date:'2026-10-01',description:'Preserved legacy transaction',currency:'INR',categoryId:'food',subcategory:'Groceries',debit:12345,credit:0,adjustment:0});
  const legacy=await createVault(legacyData,legacyPassword);
  await page.goto(origin);await page.locator('#auth-form').waitFor();
  await page.evaluate(envelope=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('pocket-ledger-secure');
    request.onsuccess=()=>{const database=request.result,transaction=database.transaction('vault','readwrite');transaction.objectStore('vault').put(envelope,'primary');transaction.oncomplete=()=>{database.close();resolve();};transaction.onerror=()=>reject(transaction.error);};
  }),legacy.envelope);
  await page.reload();await page.locator('#auth-form [name=password]').fill(legacyPassword);await page.locator('#auth-form [type=submit]').click();await page.locator('.sidebar').waitFor();
  for(const view of ['valuation','investments','home-loan']){await nav(view);await page.locator('h1').waitFor();}
  await nav('settings');await action('change-pin');await fill({current:legacyPassword,pin,confirm:pin});await save();
  assert.equal((await stored()).version,2);assert.deepEqual((await persisted(data=>data.transactions.length===1)).transactions,legacyData.transactions);
  check('legacy encrypted ledgers open all new sections and migrate without losing transactions');

  await nav('valuation');
  await addOption('accountTypes','Brokerage');
  await action('planning-add-valuation');const accountId=await input('accountTypeId').locator('option').filter({hasText:'Brokerage'}).getAttribute('value');await action('close-modal');
  await addOption('subtypes','Index holdings',accountId);
  await addOption('valuationCategories','Long term assets');
  await action('planning-add-valuation');await selectText('accountTypeId','Brokerage');await selectText('subtypeId','Index holdings');await selectText('categoryId','Long term assets');
  await input('month').selectOption('01');await input('year').selectOption('2026');
  await input('value').click();await input('value').pressSequentially('1250.25');assert.equal(await input('value').inputValue(),'1250.25');await save();
  let valuationRow=rowContaining('Index holdings');await valuationRow.waitFor();assert.match(await valuationRow.textContent(),/1,250\.25|1,250/);
  await editRow(valuationRow,'planning-valuation');await input('value').fill('1500');await save();
  await changePlanning('pivotRow','accountType');await changePlanning('pivotColumn','year');
  assert.match(await section().textContent(),/Brokerage/);assert.match(await section().textContent(),/1,500/);
  const valuationPivot=page.locator('.planning-section').filter({has:page.getByRole('heading',{name:'Valuation pivot',exact:true})});
  await changePlanning('pivotMeasure','count');assert.equal((await valuationPivot.locator('tbody tr').last().locator('td').last().textContent()).trim(),'1');
  await changePlanning('pivotMeasure','value');
  await action('planning-add-valuation');await selectText('accountTypeId','Brokerage');await selectText('subtypeId','Index holdings');await selectText('categoryId','Long term assets');await input('month').selectOption('01');await input('year').selectOption('2026');await input('value').fill('25');await input('currency').selectOption('CHF');await save();
  assert.equal(await rowContaining('Index holdings').count(),1);
  await page.locator('#currency-select').selectOption('CHF');await rowContaining('Index holdings').waitFor();assert.match(await rowContaining('Index holdings').textContent(),/25/);assert.doesNotMatch(await section().textContent(),/1,500/);
  await page.locator('#currency-select').selectOption('INR');
  check('valuation dropdowns, local account/subtype/category options, editing, pivots and separate currencies');

  await action('planning-add-valuation');await selectText('accountTypeId','Brokerage');await selectText('subtypeId','Index holdings');await selectText('categoryId','Long term assets');await input('value').fill('333');
  await persisted(data=>data.workspace?.modal?.kind==='planning-valuation'&&data.workspace.modal.values.some(value=>value.name==='value'&&value.value==='333'));
  await page.evaluate(()=>window.pocketLedgerLock());await page.locator('#auth-form').waitFor();await reopen();
  assert.equal(await input('accountTypeId').inputValue(),accountId);assert.equal(await input('subtypeId').locator('option:checked').textContent(),'Index holdings');assert.equal(await input('value').inputValue(),'333');await action('close-modal');
  check('unfinished valuation restores a custom account type and its dependent subtype after unlock');

  await nav('investments');await addOption('investmentTypes','Index SIP');
  await action('planning-add-investment');await selectText('typeId','Index SIP');await fill({details:'Fictional education investment',accountNumber:'TEST-1234',startDate:'2026-03-15',endDate:'2026-05-03',monthly:'100'});await save();
  await changePlanning('investmentMonth','2026-04');
  let investment=rowContaining('Fictional education investment');await investment.waitFor();assert.match(await investment.textContent(),/100/);
  await investment.locator('[data-action="planning-actual"]').click();await fill({month:'2026-04',amount:'80'});await save();
  investment=rowContaining('Fictional education investment');assert.match(await investment.textContent(),/80/);
  await investment.locator('[data-action="planning-actual"]').click();await fill({month:'2026-04',amount:'80'});await save();
  await investment.locator('[data-action="planning-actual"]').click();await fill({month:'2026-05',amount:'90'});await save();
  await action('planning-investment-year');await changePlanning('investmentYear','2026');
  investment=rowContaining('Fictional education investment');assert.match(await investment.textContent(),/300/);assert.match(await investment.textContent(),/170/);
  await action('planning-investment-month');await changePlanning('investmentMonth','2026-02');assert.match(await rowContaining('Fictional education investment').textContent(),/0/);
  await changePlanning('investmentMonth','2026-04');
  await editRow(rowContaining('Fictional education investment'),'planning-investment');await input('monthly').fill('125');await save();assert.match(await rowContaining('Fictional education investment').textContent(),/125/);
  await action('planning-investment-year');await changePlanning('investmentYear','2026');assert.match(await rowContaining('Fictional education investment').textContent(),/375/);
  check('investment types, scheduled month/year totals, inclusive partial months, actual monthly amounts and editing');

  await nav('home-loan');
  for(const cost of [{component:'Registration',type:'Government',percentage:'5',toPay:'500',paid:'200'},{component:'Registration',type:'Legal',percentage:'1',toPay:'100',paid:'50'}]){await action('planning-add-cost');await fill(cost);await save();}
  assert.match(await section().textContent(),/Registration/);assert.match(await section().textContent(),/600/);assert.match(await section().textContent(),/250/);assert.match(await section().textContent(),/350/);
  await action('planning-add-repayment');await fill({sequence:'1',paymentType:'Booking',agreementValue:'10000',percentage:'10',toPay:'1000',demand:'900',paid:'800',comment:'Fictional first demand'});await save();
  await rowContaining('Fictional first demand').waitFor();assert.match(await rowContaining('Fictional first demand').textContent(),/1,000/);assert.match(await rowContaining('Fictional first demand').textContent(),/900/);
  for(const status of [{asOn:'2026-03-01',approved:'10000',disbursed:'4000',principalPaid:'100',interestPaid:'50'},{asOn:'2026-04-01',approved:'10000',disbursed:'6000',principalPaid:'300',interestPaid:'125'}]){await action('planning-add-status');await fill(status);await save();}
  assert.match(await rowContaining('Outstanding principal').textContent(),/5,700/);assert.match(await rowContaining('Undisbursed approval').textContent(),/4,000/);
  await editRow(rowContaining('Fictional first demand'),'planning-repayment');await input('paid').fill('850');await save();assert.match(await rowContaining('Fictional first demand').textContent(),/850/);
  check('home-loan component totals, repayment schedules and latest dated status summary');

  await nav('investments');await action('planning-add-investment');await input('details').fill('Encrypted unfinished investment draft');await input('accountNumber').fill('PRIVATE-DRAFT-5678');
  await persisted(data=>data.workspace?.modal?.values.some(value=>value.name==='details'&&value.value==='Encrypted unfinished investment draft'));
  assert.ok(!JSON.stringify(await stored()).includes('PRIVATE-DRAFT-5678'));
  await page.evaluate(()=>window.pocketLedgerLock());await page.locator('#auth-form').waitFor();await reopen();assert.equal(await input('details').inputValue(),'Encrypted unfinished investment draft');assert.equal(await input('accountNumber').inputValue(),'PRIVATE-DRAFT-5678');await action('close-modal');
  await nav('valuation');await rowContaining('Index holdings').waitFor();
  await nav('home-loan');await rowContaining('Fictional first demand').waitFor();
  check('new form drafts and all planning data survive encrypted lock and reopen');

  const duplicates='Date,Description,Debit,Credit\n01/10/2026,Duplicate allowed,10,0\n01/10/2026,Duplicate allowed,10,0\n';
  await importCSV('duplicate-allowed.csv',duplicates);assert.equal(await page.locator('[data-field=include]:checked').count(),2);assert.equal(await page.locator('#accept-duplicates').count(),0);
  await action('finalize-import');await page.locator('.ledger-table').waitFor();
  await importCSV('duplicate-existing.csv',duplicates);assert.equal(await page.locator('[data-field=include]:checked').count(),2);await action('finalize-import');
  await persisted(data=>data.transactions.filter(transaction=>transaction.description==='Duplicate allowed').length===4);
  check('repeated statement rows stay selected and import without duplicate confirmation');

  const reviewRows=1205;
  await importCSV('paged-review.csv','Date,Description,Debit,Credit\n'+Array.from({length:reviewRows},(_,index)=>`01/10/2026,Paged row ${index+1},1,0`).join('\n'));
  assert.ok(await page.locator('.review tbody tr').count()<=250,'Review should render only a bounded page');
  await action('deselect-all-import');assert.match(await page.locator('#review-count').textContent(),/^0 selected/);
  await action('select-all-import');assert.match(await page.locator('#review-count').textContent(),/^1205 selected/);
  await action('review-next');const laterDescription=page.locator('.review [data-field=description]').first();assert.notEqual(await laterDescription.inputValue(),'Paged row 1');await laterDescription.fill('Edited second-page review row');await laterDescription.press('Tab');
  await action('finalize-import');await page.locator('.ledger-table').waitFor();await persisted(data=>data.transactions.some(transaction=>transaction.description==='Edited second-page review row')&&data.transactions.length===1210);
  check('paged review, select all/none across every page and later-page edits');

  for(const width of [390,800,1280]){
    await page.setViewportSize({width,height:1000});
    for(const view of ['valuation','investments','home-loan']){await nav(view);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${view} overflowed at ${width}px`);}
  }
  await page.setViewportSize({width:1280,height:1000});
  check('new sections fit phone, portrait tablet and landscape layouts');

  if(process.env.PL_STRESS==='1'){
    page.setDefaultTimeout(90000);
    const count=500000,start=performance.now();
    let csv='Date,Description,Debit,Credit\n';
    for(let index=0;index<count;index++)csv+=`01/10/2026,Scale row ${index+1},1,0\n`;
    timings.csvBytes=Buffer.byteLength(csv);
    await importCSV('fictional-500000.csv',csv);csv='';
    timings.reviewMs=Math.round(performance.now()-start);
    console.log('STRESS review ready in',timings.reviewMs,'ms');
    assert.match(await page.locator('#review-count').textContent(),/^500000 selected/);
    assert.ok(await page.locator('.review tbody tr').count()<=250);
    const draftStart=performance.now();console.log('STRESS saving and reopening the 500000-row encrypted review draft');
    await page.locator('.review [data-field=description]').first().fill('Scale row 1 with restored draft');
    await page.evaluate(()=>window.pocketLedgerBackground());await page.evaluate(()=>window.pocketLedgerLock());await page.locator('#auth-form').waitFor();
    await reopen();await page.locator('.review').waitFor();assert.equal(await page.locator('.review [data-field=description]').first().inputValue(),'Scale row 1 with restored draft');assert.match(await page.locator('#review-count').textContent(),/^500000 selected/);
    timings.reviewDraftReopenMs=Math.round(performance.now()-draftStart);console.log('STRESS encrypted review draft reopened in',timings.reviewDraftReopenMs,'ms');
    const finalizeStart=performance.now();console.log('STRESS finalizing encrypted import');await action('finalize-import');await page.locator('.ledger-table').waitFor();timings.finalizeMs=Math.round(performance.now()-finalizeStart);console.log('STRESS encrypted import finalized in',timings.finalizeMs,'ms');
    const reopenStart=performance.now();console.log('STRESS reopening encrypted ledger');await reopen();await nav('transactions');await page.locator('.ledger-table').waitFor();timings.reopenMs=Math.round(performance.now()-reopenStart);console.log('STRESS authenticated reopen in',timings.reopenMs,'ms');
    const envelope=await stored(),largeData=(await unlock(envelope,pin)).data;
    assert.equal(largeData.transactions.length,501210);assert.equal(largeData.transactions.filter(transaction=>transaction.description.startsWith('Scale row ')).length,count);
    assert.ok(!JSON.stringify(envelope).includes('Scale row 500000'));
    check('500,000-row browser import, encrypted review draft restoration, bounded review, saved ledger and authenticated reopen');
  }
  assert.deepEqual(errors,[]);
  await fs.writeFile('test-results/planning-ui-results.json',JSON.stringify({passed:true,date:new Date().toISOString(),checks,timings,runtimeErrors:errors},null,2));
}catch(error){
  try{await page.screenshot({path:'test-results/planning-ui-failure.png',fullPage:true});}catch{}
  await fs.writeFile('test-results/planning-ui-results.json',JSON.stringify({passed:false,date:new Date().toISOString(),checks,timings,runtimeErrors:errors,error:error.stack},null,2));
  console.error(error);if(errors.length)console.error(errors);process.exitCode=1;
}finally{await browser.close();}
