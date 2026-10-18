import {validateData} from './core.js';
const enc=new TextEncoder(), dec=new TextDecoder();
const b64=bytes=>{let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);};
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const ITERATIONS=600000;
async function derive(password,salt,iterations=ITERATIONS) {
  const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function encrypt(data,key,salt,iterations=ITERATIONS) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('PocketLedger:v1')},key,enc.encode(JSON.stringify(data)));
  return {format:'PocketLedger',version:1,kdf:'PBKDF2-SHA256',iterations,salt:b64(salt),iv:b64(iv),ciphertext:b64(new Uint8Array(ciphertext))};
}
export async function unlock(envelope,password) {
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
let database;
async function db() {
  if(database)return database;
  database=await new Promise((resolve,reject)=>{const r=indexedDB.open('pocket-ledger-secure',1);r.onupgradeneeded=()=>r.result.createObjectStore('vault');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  return database;
}
export async function readEnvelope() {const d=await db();return new Promise((resolve,reject)=>{const r=d.transaction('vault').objectStore('vault').get('primary');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function writeEnvelope(envelope) {const d=await db();await new Promise((resolve,reject)=>{const tx=d.transaction('vault','readwrite');tx.objectStore('vault').put(envelope,'primary');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
