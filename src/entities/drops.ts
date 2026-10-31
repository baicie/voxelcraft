import type { Vec3 } from '../core/types';
import { blockAt } from '../world/blocks';
import type { VoxelAccess } from '../world/world';
export type Drop={key:number;id:string;count:number;position:Vec3;velocity:Vec3;age:number;pickupDelay:number};
export class DropSystem{
  readonly items:Drop[]=[];private nextKey=1;
  spawn(id:string,count:number,position:Vec3,delay=0.4):Drop{const merge=this.items.find(d=>d.id===id&&d.age>0&&Math.hypot(d.position.x-position.x,d.position.y-position.y,d.position.z-position.z)<1.3);if(merge){merge.count+=count;return merge;}const drop={key:this.nextKey++,id,count,position:{...position},velocity:{x:0,y:0,z:0},age:0,pickupDelay:delay};this.items.push(drop);return drop;}
  restore(drops:{id:string;count:number;position:Vec3;age:number}[]){for(const d of drops)this.spawn(d.id,d.count,d.position,0).age=d.age;}
  update(world:VoxelAccess,dt:number,player:Vec3,tryPickup:(id:string,count:number)=>number,onPickup:(id:string,count:number)=>void):void{
    for(const d of this.items){d.age+=dt;d.pickupDelay=Math.max(0,d.pickupDelay-dt);d.velocity.y-=18*dt;
      const next={...d.position};next.y+=d.velocity.y*dt;
      if(blockAt(world.getBlock(Math.floor(next.x),Math.floor(next.y-0.1),Math.floor(next.z))).solid&&d.velocity.y<0){d.velocity.y=0;}else d.position.y=next.y;
      d.position.x+=d.velocity.x*dt;d.position.z+=d.velocity.z*dt;d.velocity.x*=0.94;d.velocity.z*=0.94;
      const distance=Math.hypot(d.position.x-player.x,d.position.y-(player.y+0.7),d.position.z-player.z);
      if(distance<2.2&&d.pickupDelay<=0){if(distance>0.2){d.position.x+=(player.x-d.position.x)*dt*5;d.position.y+=(player.y+0.5-d.position.y)*dt*5;d.position.z+=(player.z-d.position.z)*dt*5;}
        if(distance<1.4){const accepted=d.count-tryPickup(d.id,d.count);if(accepted>0){d.count-=accepted;onPickup(d.id,accepted);}}
      }
    }
    this.items.splice(0,this.items.length,...this.items.filter(d=>d.count>0&&d.age<300&&d.position.y>-10));
  }
  snapshot(){return this.items.map(d=>({id:d.id,count:d.count,position:{...d.position},age:d.age}));}
}
