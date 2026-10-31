import type { WorldMetadata, WorldSave } from '../core/types';
const DB_NAME='voxelcraft-k3';const DB_VERSION=1;const SAVE_VERSION=2;
export type WorldSummary=WorldMetadata;
function request<T>(req:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error??new Error('IndexedDB request failed'));});}
export class WorldStorage{
  private dbPromise:Promise<IDBDatabase>|null=null;private queues=new Map<string,Promise<void>>();private closed=false;
  open():Promise<IDBDatabase>{if(this.closed)return Promise.reject(new Error('Storage is closed'));if(this.dbPromise)return this.dbPromise;this.dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('worlds'))db.createObjectStore('worlds',{keyPath:'metadata.id'});if(!db.objectStoreNames.contains('settings'))db.createObjectStore('settings');};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error??new Error('Cannot open local world storage'));req.onblocked=()=>reject(new Error('Storage is blocked by another tab'));});return this.dbPromise;}
  async list():Promise<WorldSummary[]>{const db=await this.open();const tx=db.transaction('worlds','readonly');const saves=await request(tx.objectStore('worlds').getAll())as WorldSave[];return saves.filter(s=>s?.metadata).map(s=>s.metadata).sort((a,b)=>b.updatedAt-a.updatedAt);}
  async load(id:string):Promise<WorldSave|null>{const db=await this.open();const raw=await request(db.transaction('worlds','readonly').objectStore('worlds').get(id));return raw?migrate(raw):null;}
  save(save:WorldSave):Promise<void>{const snapshot=structuredClone(save);const id=snapshot.metadata.id;const previous=this.queues.get(id)??Promise.resolve();const next=previous.catch(()=>{}).then(async()=>{const db=await this.open();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('worlds','readwrite');tx.objectStore('worlds').put(snapshot);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error??new Error('World save failed'));tx.onabort=()=>reject(tx.error??new Error('World save was aborted'));});});this.queues.set(id,next);return next;}
  async delete(id:string):Promise<void>{await this.queues.get(id)?.catch(()=>{});const db=await this.open();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('worlds','readwrite');tx.objectStore('worlds').delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
  async export(id:string):Promise<string>{const save=await this.load(id);if(!save)throw new Error('World not found');return JSON.stringify(save);}
  async import(json:string):Promise<WorldSave>{const parsed=migrate(JSON.parse(json));if(!parsed.metadata.id||!parsed.metadata.name||!parsed.player)throw new Error('Invalid world archive');parsed.metadata.id=crypto.randomUUID();parsed.metadata.updatedAt=Date.now();await this.save(parsed);return parsed;}
  async setting<T>(key:string,fallback:T):Promise<T>{const db=await this.open();const value=await request(db.transaction('settings','readonly').objectStore('settings').get(key));return value===undefined?fallback:value as T;}
  async setSetting<T>(key:string,value:T):Promise<void>{const db=await this.open();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('settings','readwrite');tx.objectStore('settings').put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}
  close(){this.closed=true;this.dbPromise?.then(db=>db.close()).catch(()=>{});}
}
export function migrate(raw:unknown):WorldSave{
  if(!raw||typeof raw!=='object')throw new Error('Unsupported save data');const data=raw as Partial<Omit<WorldSave,'schema'>>&{version?:number;schema?:number};
  if(data.schema===2&&data.metadata&&data.player&&data.edits)return structuredClone(data)as WorldSave;
  if(data.schema===1&&data.metadata&&data.player){return{...structuredClone(data),schema:SAVE_VERSION,generator:1,furnaces:data.furnaces??{},drops:data.drops??[]}as WorldSave;}
  throw new Error('This save uses an unsupported version. Export a backup before migrating.');
}
