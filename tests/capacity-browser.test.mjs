import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {build} from 'esbuild';
import {chromium} from 'playwright';

test('Chrome imports, encrypts, stores and reopens a 500,000-row ledger',async t=>{
  const bundle=await build({stdin:{contents:"import * as C from './src/core.js';import * as V from './src/vault.js';import * as I from './src/imports.js';globalThis.CapacityUnderTest={C,V,I};",resolveDir:path.resolve('.')},bundle:true,format:'iife',write:false,platform:'browser',target:'chrome110'});
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-first-run','--disable-background-networking','--js-flags=--expose-gc']});
  try{
    const page=await browser.newPage();
    await page.route('http://127.0.0.1:4175/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic browser capacity test</title>'}));
    await page.goto('http://127.0.0.1:4175/capacity-test');await page.addScriptTag({content:bundle.outputFiles[0].text});
    const result=await page.evaluate(async()=>{
      const {C,V,I}=CapacityUnderTest,count=500000,times={};let start=performance.now();
      const mark=name=>{times[name]=Math.round(performance.now()-start);start=performance.now();};
      let data=C.newData(),rows=C.parseCSV('Date,Description,Debit,Credit,Subcategory\n'+'01/10/2026,Synthetic browser row,10,0,Groceries\n'.repeat(count));mark('parseMs');
      data.transactions=I.mapTransactions(rows.slice(1),I.autoMap(rows[0]),{categories:data.categories});rows=null;
      for(const row of data.transactions)row.currency='INR';globalThis.gc?.();mark('mapMs');
      const total=C.actual(data,'food','2026-10'),pivot=C.pivot(data,{dimension:'category',column:'month',measure:'count'}).get('Food & groceries','2026-10');mark('aggregateMs');
      let current=await V.createPinVault(data,'0042','synthetic browser recovery password');await V.writeEnvelope(current.envelope);mark('encryptAndStoreMs');
      const iv=current.envelope.iv;data=null;current=null;globalThis.gc?.();
      let envelope=await V.readEnvelope(),restored=await V.unlock(envelope,'0042');mark('reopenMs');
      const restoredCount=restored.data.transactions.length,last=restored.data.transactions[count-1],restoredTotal=C.actual(restored.data,'food','2026-10');
      const sameEnvelope=envelope.iv===iv,lastRaw=last.rawValues.debit,lastSource=last.sourceRow[1];
      await V.writeEnvelope(await V.encrypt(C.newData(),restored.key,null,600000,restored.protection));
      const database=await new Promise((resolve,reject)=>{const r=indexedDB.open('pocket-ledger-secure',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      const keys=await new Promise((resolve,reject)=>{const r=database.transaction('vault').objectStore('vault').getAllKeys();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      return {total,pivot,restoredCount,restoredTotal,lastRaw,lastSource,sameEnvelope,remainingKeys:keys,times};
    });
    assert.equal(result.total,500000000);assert.equal(result.pivot,500000);assert.equal(result.restoredCount,500000);assert.equal(result.restoredTotal,500000000);
    assert.equal(result.lastRaw,'10');assert.equal(result.lastSource,'Synthetic browser row');assert.equal(result.sameEnvelope,true);
    assert.deepEqual(result.remainingKeys,['primary']);
    t.diagnostic(JSON.stringify({rows:500000,...result.times}));
  }finally{await browser.close();}
});
