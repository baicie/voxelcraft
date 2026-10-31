import { CHUNK_SIZE, WORLD_HEIGHT, type ChunkPayload, type GameMode } from '../core/types';
import { B, blockAt, blockKey } from './blocks';
import { chunkKey, chunkOf, voxelIndex } from './coordinates';
import { columnAt } from './generator';

export type ChunkState='queued'|'generating'|'ready'|'meshing'|'visible'|'disposed';
export type ChunkRecord={cx:number;cz:number;voxels:Uint8Array;biomes:Uint8Array;state:ChunkState;revision:number;meshedRevision:number;generationMs:number};
export type VoxelAccess={getBlock(x:number,y:number,z:number):number};
export class VoxelWorld implements VoxelAccess{
  readonly chunks=new Map<string,ChunkRecord>();
  readonly edits=new Map<string,number>();
  constructor(readonly seed:number,readonly mode:GameMode,edits:Record<string,number>={}){for(const [key,id]of Object.entries(edits))this.edits.set(key,id);}
  static key(cx:number,cz:number){return chunkKey(cx,cz);}
  editsFor(cx:number,cz:number):Record<string,number>{const result:Record<string,number>={};for(const [key,id]of this.edits){const [x,,z]=key.split(',').map(Number);if(Math.floor(x/CHUNK_SIZE)===cx&&Math.floor(z/CHUNK_SIZE)===cz)result[key]=id;}return result;}
  addChunk(payload:ChunkPayload):ChunkRecord{const existing=this.chunks.get(chunkKey(payload.cx,payload.cz));if(existing)existing.state='disposed';const record={cx:payload.cx,cz:payload.cz,voxels:payload.voxels,biomes:payload.biomes,state:'ready' as const,revision:0,meshedRevision:-1,generationMs:0};this.chunks.set(chunkKey(payload.cx,payload.cz),record);return record;}
  getBlock(x:number,y:number,z:number):number{
    x=Math.floor(x);z=Math.floor(z);if(y<0)return B.bedrock;if(y>=WORLD_HEIGHT)return B.air;
    const {cx,cz}=chunkOf(x,z);const chunk=this.chunks.get(chunkKey(cx,cz));if(!chunk)return B.air;
    return chunk.voxels[voxelIndex(x-cx*CHUNK_SIZE,y,z-cz*CHUNK_SIZE)];
  }
  getLoadedBlock(x:number,y:number,z:number):number|null{const {cx,cz}=chunkOf(x,z);return this.chunks.has(chunkKey(cx,cz))?this.getBlock(x,y,z):null;}
  setBlock(x:number,y:number,z:number,id:number,recordEdit=true):boolean{
    if(y<=0||y>=WORLD_HEIGHT)return false;const {cx,cz}=chunkOf(x,z);const chunk=this.chunks.get(chunkKey(cx,cz));if(!chunk)return false;
    chunk.voxels[voxelIndex(x-cx*CHUNK_SIZE,y,z-cz*CHUNK_SIZE)]=id;chunk.revision++;
    if(recordEdit){const key=blockKey(x,y,z);this.edits.set(key,id);}
    return true;
  }
  removeChunk(cx:number,cz:number):ChunkRecord|undefined{const key=chunkKey(cx,cz);const c=this.chunks.get(key);if(c)c.state='disposed';this.chunks.delete(key);return c;}
  isSolid(x:number,y:number,z:number):boolean{return blockAt(this.getBlock(x,y,z)).solid;}
  surface(x:number,z:number):number{const c=columnAt(this.seed,Math.floor(x),Math.floor(z));return c.height;}
  biomeAt(x:number,z:number):number{const {cx,cz}=chunkOf(x,z);const chunk=this.chunks.get(chunkKey(cx,cz));return chunk?.biomes[((x%CHUNK_SIZE)+CHUNK_SIZE)%CHUNK_SIZE+(((z%CHUNK_SIZE)+CHUNK_SIZE)%CHUNK_SIZE)*CHUNK_SIZE]??columnAt(this.seed,x,z).biome;}
  snapshotEdits():Record<string,number>{return Object.fromEntries(this.edits);}
}
