import {validateData} from './core.js';
const enc=new TextEncoder(), dec=new TextDecoder();
// Bounded chunks avoid millions of one-character strings and whole-payload
// binary-string copies when saving a large ledger. These remain standard base64.
const b64=bytes=>{const parts=[];for(let i=0;i<bytes.length;i+=24576)parts.push(btoa(String.fromCharCode(...bytes.subarray(i,i+24576))));return parts.join('');};
const unb64=s=>{if(typeof s!=='string'||s.length%4)throw new Error('Invalid encrypted data.');const padding=s.endsWith('==')?2:s.endsWith('=')?1:0,bytes=new Uint8Array(s.length/4*3-padding);let offset=0;for(let i=0;i<s.length;i+=32768){const chunk=atob(s.slice(i,i+32768));for(let j=0;j<chunk.length;j++)bytes[offset++]=chunk.charCodeAt(j);}return bytes;};
const ITERATIONS=600000;
async function derive(password,salt,iterations=ITERATIONS) {
  const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function encrypt(data,key,salt,iterations=ITERATIONS,protection=null) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const bytes=enc.encode(JSON.stringify(data));let ciphertext;
  try{ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('PocketLedger:v1')},key,bytes);}finally{bytes.fill(0);}
  return protection ? {format:'PocketLedger',version:2,protection,iv:b64(iv),ciphertext:b64(new Uint8Array(ciphertext))} : {format:'PocketLedger',version:1,kdf:'PBKDF2-SHA256',iterations,salt:b64(salt),iv:b64(iv),ciphertext:b64(new Uint8Array(ciphertext))};
}
export async function unlock(envelope,password,mode='pin') {
  if(envelope?.format==='PocketLedger'&&envelope.version===2){
    const raw=await openKey(envelope.protection?.[mode],password,mode);
    const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);raw.fill(0);
    let plain;
    try{plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(envelope.iv),additionalData:enc.encode('PocketLedger:v1')},key,unb64(envelope.ciphertext));}
    catch{throw new Error('The encrypted vault is damaged. Your stored data has not been changed.');}
    return {data:validateData(JSON.parse(dec.decode(plain))),key,protection:envelope.protection};
  }
  if(envelope?.format!=='PocketLedger'||envelope.version!==1||envelope.kdf!=='PBKDF2-SHA256'||!Number.isInteger(envelope.iterations)||envelope.iterations<100000||envelope.iterations>2000000)throw new Error('Unsupported or damaged encrypted backup.');
  const salt=unb64(envelope.salt),iv=unb64(envelope.iv);
  if(salt.length!==16||iv.length!==12)throw new Error('Invalid encrypted vault.');
  const key=await derive(password,salt,envelope.iterations);
  let plain;
  try {plain=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:enc.encode('PocketLedger:v1')},key,unb64(envelope.ciphertext));}
  catch {throw new Error('The password is incorrect, or the encrypted file has been damaged.');}
  return {data:validateData(JSON.parse(dec.decode(plain))),key,salt,iterations:envelope.iterations};
}
export async function createVault(data,password) {
  if(password.length<10)throw new Error('Use a password with at least 10 characters.');
  const salt=crypto.getRandomValues(new Uint8Array(16)), key=await derive(password,salt);
  return {data,key,salt,iterations:ITERATIONS,envelope:await encrypt(data,key,salt)};
}
function checkPin(pin){if(!/^\d{4}$/.test(pin))throw new Error('Choose exactly four digits for your PIN.');}
function checkRecovery(password){if(password.length<10)throw new Error('Use a recovery password with at least 10 characters.');}
async function wrapKey(raw,secret,label){
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await derive(secret,salt);
  const sealed=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('PocketLedger:key:'+label)},key,raw);
  return {salt:b64(salt),iv:b64(iv),iterations:ITERATIONS,ciphertext:b64(new Uint8Array(sealed))};
}
async function openKey(slot,secret,label){
  if(!slot||!Number.isInteger(slot.iterations)||slot.iterations<100000||slot.iterations>2000000)throw new Error('Unsupported or damaged unlock information.');
  const salt=unb64(slot.salt),iv=unb64(slot.iv);
  if(salt.length!==16||iv.length!==12)throw new Error('Invalid unlock information.');
  const key=await derive(secret,salt,slot.iterations);
  try{return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:enc.encode('PocketLedger:key:'+label)},key,unb64(slot.ciphertext)));}
  catch{throw new Error(label==='pin'?'Incorrect PIN. Use your recovery password if you forgot it.':'Incorrect recovery password. The encrypted ledger has not been changed.');}
}
export async function createPinVault(data,pin,recoveryPassword){
  checkPin(pin);checkRecovery(recoveryPassword);
  const raw=crypto.getRandomValues(new Uint8Array(32));
  const protection={pin:await wrapKey(raw,pin,'pin'),recovery:await wrapKey(raw,recoveryPassword,'recovery')};
  const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);raw.fill(0);
  return {data,key,protection,envelope:await encrypt(data,key,null,ITERATIONS,protection)};
}
export async function changeCredential(envelope,data,current,newSecret,mode='pin',usingRecovery=false){
  if(mode==='pin')checkPin(newSecret);else checkRecovery(newSecret);
  const raw=await openKey(envelope.protection?.[usingRecovery?'recovery':mode],current,usingRecovery?'recovery':mode);
  const protection={...envelope.protection,[mode]:await wrapKey(raw,newSecret,mode)};
  const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);raw.fill(0);
  return {data,key,protection,envelope:await encrypt(data,key,null,ITERATIONS,protection)};
}
let database;
async function db() {
  if(database)return database;
  database=await new Promise((resolve,reject)=>{const r=indexedDB.open('pocket-ledger-secure',1);r.onupgradeneeded=()=>r.result.createObjectStore('vault');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  return database;
}
// Chromium limits the serialized size of a single IndexedDB value. Ciphertext
// chunks keep large ledgers below that limit without changing AES envelopes or
// exported backup files. All chunks and their manifest commit atomically.
const STORAGE_CHUNK=4*1024*1024;
const chunkKey=(key,index)=>`${key}:ciphertext:${index}`;
function deleteStored(store,key){store.delete(key);store.delete(IDBKeyRange.bound(`${key}:ciphertext:`,`${key}:ciphertext:\uffff`));}
function putStored(store,key,value){
  deleteStored(store,key);
  const record={...value};delete record._ciphertextChunks;
  if(value.ciphertext.length<=STORAGE_CHUNK){store.put(record,key);return;}
  const count=Math.ceil(value.ciphertext.length/STORAGE_CHUNK);
  record.ciphertext='';record._ciphertextChunks={count,length:value.ciphertext.length};store.put(record,key);
  for(let i=0;i<count;i++)store.put(value.ciphertext.slice(i*STORAGE_CHUNK,(i+1)*STORAGE_CHUNK),chunkKey(key,i));
}
async function readStored(key,accept=()=>true){
  const d=await db();return new Promise((resolve,reject)=>{
    const tx=d.transaction('vault'),store=tx.objectStore('vault'),request=store.get(key);let record,parts,error;
    request.onsuccess=()=>{
      record=request.result;if(!record||!accept(record)){record=undefined;return;}
      const manifest=record._ciphertextChunks;if(!manifest)return;
      if(!Number.isSafeInteger(manifest.count)||manifest.count<1||manifest.count>2048||!Number.isSafeInteger(manifest.length)||Math.ceil(manifest.length/STORAGE_CHUNK)!==manifest.count){error=new Error('The encrypted vault has an invalid storage manifest.');return;}
      parts=new Array(manifest.count);
      for(let i=0;i<manifest.count;i++){const r=store.get(chunkKey(key,i));r.onsuccess=()=>{if(typeof r.result!=='string'||r.result.length>STORAGE_CHUNK)error=new Error('The encrypted vault is missing stored ciphertext.');else parts[i]=r.result;};}
    };
    tx.oncomplete=()=>{if(error){reject(error);return;}if(parts){const ciphertext=parts.join('');if(ciphertext.length!==record._ciphertextChunks.length){reject(new Error('The encrypted vault is missing stored ciphertext.'));return;}record={...record,ciphertext};delete record._ciphertextChunks;}resolve(record);};
    tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
export async function readEnvelope() {return readStored('primary');}
export async function writeEnvelope(envelope) {const d=await db();await new Promise((resolve,reject)=>{const tx=d.transaction('vault','readwrite'),store=tx.objectStore('vault');let failure;tx.oncomplete=resolve;tx.onerror=()=>reject(failure||tx.error);tx.onabort=()=>reject(failure||tx.error);try{deleteStored(store,'workspace');putStored(store,'primary',envelope);}catch(error){failure=error;try{tx.abort();}catch{}reject(error);}});}
// Draft-only saves use the active nonextractable data key. Binding them to the
// primary IV prevents an old queued draft from being applied after a data save,
// credential change or restore. The primary envelope and backup format stay intact.
export async function writeWorkspace(snapshot,current,baseEnvelope) {
  if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))throw new Error('Invalid workspace progress.');
  const iv=crypto.getRandomValues(new Uint8Array(12)),bytes=enc.encode(JSON.stringify(snapshot));let sealed;
  try{sealed=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('PocketLedger:workspace:v1')},current.key,bytes);}finally{bytes.fill(0);}
  const record={baseIv:baseEnvelope.iv,iv:b64(iv),ciphertext:b64(new Uint8Array(sealed))},d=await db();
  return new Promise((resolve,reject)=>{const tx=d.transaction('vault','readwrite'),store=tx.objectStore('vault'),request=store.get('primary');let saved=false,failure;request.onsuccess=()=>{if(request.result?.iv===record.baseIv){try{putStored(store,'workspace',record);saved=true;}catch(error){failure=error;try{tx.abort();}catch{}reject(error);}}};tx.oncomplete=()=>resolve(saved);tx.onerror=()=>reject(failure||tx.error);tx.onabort=()=>reject(failure||tx.error);});
}
export async function readWorkspace(current,baseEnvelope) {
  const record=await readStored('workspace',stored=>stored.baseIv===baseEnvelope.iv);
  if(!record)return undefined;
  try{const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(record.iv),additionalData:enc.encode('PocketLedger:workspace:v1')},current.key,unb64(record.ciphertext));const snapshot=JSON.parse(dec.decode(plain));if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))throw new Error();return snapshot;}
  catch{throw new Error('Saved progress could not be decrypted. Your encrypted ledger has not been changed.');}
}
