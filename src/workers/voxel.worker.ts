/// <reference lib="webworker" />
import type { WorkerRequest, WorkerResponse } from '../core/types';
import { generateChunk } from '../world/generator';
import { buildMesh } from '../world/mesher';
const worker=self as unknown as DedicatedWorkerGlobalScope;
worker.onmessage=(event:MessageEvent<WorkerRequest>)=>{
  const message=event.data;
  try{
    if(message.type==='generate'){
      const started=performance.now();const payload=generateChunk(message.seed,message.cx,message.cz,message.edits);
      const response:WorkerResponse={type:'generated',id:message.id,epoch:message.epoch,payload};
      worker.postMessage(response,{transfer:[payload.voxels.buffer,payload.biomes.buffer]});
      void started;
    }else{
      const started=performance.now();const mesh=buildMesh(message.voxels,message.neighbors);
      const response:WorkerResponse={type:'meshed',id:message.id,epoch:message.epoch,cx:message.cx,cz:message.cz,...mesh,buildMs:performance.now()-started};
      worker.postMessage(response,{transfer:[mesh.opaque.positions.buffer,mesh.opaque.normals.buffer,mesh.opaque.uvs.buffer,mesh.opaque.colors.buffer,mesh.opaque.indices.buffer,mesh.water.positions.buffer,mesh.water.normals.buffer,mesh.water.uvs.buffer,mesh.water.colors.buffer,mesh.water.indices.buffer]});
    }
  }catch(error){worker.postMessage({type:'error',id:message.id,epoch:message.epoch,message:error instanceof Error?error.message:String(error)} satisfies WorkerResponse);}
};
