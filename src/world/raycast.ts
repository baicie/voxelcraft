import type { Vec3 } from '../core/types';
import { blockAt } from './blocks';
export type RayHit={x:number;y:number;z:number;nx:number;ny:number;nz:number;id:number;distance:number};
export function raycast(getBlock:(x:number,y:number,z:number)=>number,origin:Vec3,direction:Vec3,maxDistance=6):RayHit|null{
  const length=Math.hypot(direction.x,direction.y,direction.z);if(length===0)return null;
  const dx=direction.x/length,dy=direction.y/length,dz=direction.z/length;
  let x=Math.floor(origin.x),y=Math.floor(origin.y),z=Math.floor(origin.z);
  const sx=dx>=0?1:-1,sy=dy>=0?1:-1,sz=dz>=0?1:-1;
  const deltaX=dx===0?Infinity:Math.abs(1/dx),deltaY=dy===0?Infinity:Math.abs(1/dy),deltaZ=dz===0?Infinity:Math.abs(1/dz);
  let tx=dx===0?Infinity:((dx>0?x+1:x)-origin.x)/dx;
  let ty=dy===0?Infinity:((dy>0?y+1:y)-origin.y)/dy;
  let tz=dz===0?Infinity:((dz>0?z+1:z)-origin.z)/dz;
  let distance=0,nx=0,ny=0,nz=0;
  for(let step=0;step<256&&distance<=maxDistance;step++){
    const id=getBlock(x,y,z);if(id!==0&&!blockAt(id).liquid)return{x,y,z,nx,ny,nz,id,distance};
    if(tx<ty&&tx<tz){x+=sx;distance=tx;tx+=deltaX;nx=-sx;ny=0;nz=0;}
    else if(ty<tz){y+=sy;distance=ty;ty+=deltaY;nx=0;ny=-sy;nz=0;}
    else{z+=sz;distance=tz;tz+=deltaZ;nx=0;ny=0;nz=-sz;}
  }
  return null;
}
