import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';

test('isolated encrypted drafts survive reopen and reject stale, racing or damaged writes',async()=>{
  const bundle=await build({entryPoints:['src/vault.js'],bundle:true,format:'iife',globalName:'VaultUnderTest',write:false,platform:'browser',target:'chrome110'});
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--no-first-run','--disable-background-networking']});
  try{
    const context=await browser.newContext(),page=await context.newPage();
    // A routed loopback page gives this disposable browser context a secure
    // IndexedDB origin without depending on, or modifying, a running app server.
    await page.route('http://127.0.0.1:4174/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Encrypted draft test</title>'}));
    await page.goto('http://127.0.0.1:4174/workspace-test');await page.addScriptTag({content:bundle.outputFiles[0].text});
    const result=await page.evaluate(async()=>{
      const V=VaultUnderTest,data={version:1,settings:{currency:'INR',dateFormat:'DMY',autoLock:5},types:[],categories:[],transactions:[],budgets:[],reports:[],family:[],milestones:[],imports:[]};
      const current=await V.createVault(data,'synthetic workspace password');
      await V.writeEnvelope(current.envelope);
      const snapshot={view:'imports',modal:{kind:'transaction',values:[{name:'description',value:'private pending entry'}]},importReview:[{rawValues:{debit:'???'}}],padding:'x'.repeat(4000000)};
      const saved=await V.writeWorkspace(snapshot,current,current.envelope),reopened=await V.readWorkspace(await V.unlock(await V.readEnvelope(),'synthetic workspace password'),current.envelope);
      const wrongBase=await V.readWorkspace(current,{iv:'another primary'});
      const database=await new Promise((resolve,reject)=>{const r=indexedDB.open('pocket-ledger-secure',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      const get=key=>new Promise((resolve,reject)=>{const r=database.transaction('vault').objectStore('vault').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      const record=await get('workspace'),encryptedOnly=!JSON.stringify(record).includes('private pending entry'),chunkedWorkspace=record._ciphertextChunks?.count>1;
      const next=await V.encrypt({...data,workspace:{view:'dashboard'}},current.key,current.salt);
      const originalPut=IDBObjectStore.prototype.put;
      let failedPrimary=false;
      IDBObjectStore.prototype.put=function(value,key){if(key==='primary:ciphertext:1')throw new DOMException('Synthetic storage write failure','DataCloneError');return originalPut.call(this,value,key);};
      try{await V.writeEnvelope({...next,ciphertext:'A'.repeat(5*1024*1024)});}catch{failedPrimary=true;}finally{IDBObjectStore.prototype.put=originalPut;}
      const failedPrimaryPreserved=(await V.readEnvelope()).iv===current.envelope.iv&&(await V.readWorkspace(current,current.envelope)).padding.length===4000000;
      let failedWorkspace=false;
      IDBObjectStore.prototype.put=function(value,key){if(key==='workspace:ciphertext:1')throw new DOMException('Synthetic draft write failure','DataCloneError');return originalPut.call(this,value,key);};
      try{await V.writeWorkspace({...snapshot,view:'transactions'},current,current.envelope);}catch{failedWorkspace=true;}finally{IDBObjectStore.prototype.put=originalPut;}
      const failedWorkspacePreserved=(await V.readWorkspace(current,current.envelope)).view==='imports';
      const racing=V.writeWorkspace({...snapshot,padding:'z'.repeat(2000000)},current,current.envelope);
      await V.writeEnvelope(next);await racing;
      const raceResult=await V.readWorkspace(current,next),staleSaved=await V.writeWorkspace(snapshot,current,current.envelope);
      const freshSaved=await V.writeWorkspace(snapshot,current,next);
      const damaged=await get('workspace'),damagedKey=damaged._ciphertextChunks?'workspace:ciphertext:0':'workspace';
      let damagedValue;if(damaged._ciphertextChunks){const chunk=await get(damagedKey);damagedValue=(chunk[0]==='A'?'B':'A')+chunk.slice(1);}else{damaged.ciphertext=(damaged.ciphertext[0]==='A'?'B':'A')+damaged.ciphertext.slice(1);damagedValue=damaged;}
      await new Promise((resolve,reject)=>{const tx=database.transaction('vault','readwrite');tx.objectStore('vault').put(damagedValue,damagedKey);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
      let damagedRejected=false;try{await V.readWorkspace(current,next);}catch{damagedRejected=true;}
      return {saved,reopened,wrongBase,encryptedOnly,chunkedWorkspace,failedPrimary,failedPrimaryPreserved,failedWorkspace,failedWorkspacePreserved,raceResult,staleSaved,freshSaved,damagedRejected,primaryPreserved:(await V.readEnvelope()).iv===next.iv};
    });
    assert.equal(result.saved,true);assert.equal(result.reopened.modal.values[0].value,'private pending entry');assert.equal(result.reopened.importReview[0].rawValues.debit,'???');
    assert.equal(result.reopened.padding.length,4000000);assert.equal(result.wrongBase,undefined);assert.equal(result.encryptedOnly,true);assert.equal(result.chunkedWorkspace,true);
    assert.equal(result.failedPrimary,true);assert.equal(result.failedPrimaryPreserved,true);assert.equal(result.failedWorkspace,true);assert.equal(result.failedWorkspacePreserved,true);
    assert.equal(result.raceResult,undefined);assert.equal(result.staleSaved,false);assert.equal(result.freshSaved,true);assert.equal(result.damagedRejected,true);assert.equal(result.primaryPreserved,true);
  }finally{await browser.close();}
});
