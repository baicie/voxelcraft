import type { WorkerRequest, WorkerResponse } from '../core/types';
export type TaskHandler=(response:WorkerResponse)=>void;
export class WorkerClient{
  private worker:Worker|null=null;private nextId=1;private handlers=new Map<number,TaskHandler>();private _epoch=0;
  get epoch(){return this._epoch;}
  start():void{if(this.worker)return;this.worker=new Worker(new URL('./voxel.worker.ts',import.meta.url),{type:'module'});this.worker.onmessage=(event:MessageEvent<WorkerResponse>)=>{const data=event.data;const handler=this.handlers.get(data.id);if(!handler||data.epoch!==this._epoch)return;this.handlers.delete(data.id);handler(data);};this.worker.onerror=event=>{for(const handler of this.handlers.values())handler({type:'error',id:0,epoch:this._epoch,message:event.message});this.handlers.clear();};}
  send(request:Omit<Extract<WorkerRequest,{type:'generate'}>,'id'|'epoch'>,handler:TaskHandler):number;
  send(request:Omit<Extract<WorkerRequest,{type:'mesh'}>,'id'|'epoch'>,handler:TaskHandler):number;
  send(request:Omit<WorkerRequest,'id'|'epoch'>,handler:TaskHandler):number{
    this.start();const id=this.nextId++;this.handlers.set(id,handler);this.worker!.postMessage({...request,id,epoch:this._epoch} as WorkerRequest);return id;
  }
  cancelEpoch():void{this._epoch++;this.handlers.clear();this.worker?.terminate();this.worker=null;}
  dispose():void{this.cancelEpoch();}
}
export function acceptEpoch(taskEpoch:number,currentEpoch:number):boolean{return taskEpoch===currentEpoch;}
