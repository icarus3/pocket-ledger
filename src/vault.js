import {validateData} from './core.js';
const enc=new TextEncoder(), dec=new TextDecoder();
const b64=bytes=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);};
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const ITERATIONS=600000;
async function derive(password,salt,iterations=ITERATIONS) {
  const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function encrypt(data,key,salt,iterations=ITERATIONS,protection=null) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('PocketLedger:v1')},key,enc.encode(JSON.stringify(data)));
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
export async function readEnvelope() {const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('vault').objectStore('vault').get('primary');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function writeEnvelope(envelope) {const d=await db();await new Promise((resolve,reject)=>{const tx=d.transaction('vault','readwrite');tx.objectStore('vault').put(envelope,'primary');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
