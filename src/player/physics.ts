import type { Vec3 } from '../core/types';
import { blockAt } from '../world/blocks';
import type { VoxelAccess } from '../world/world';
export type MoveInput={forward:number;strafe:number;jump:boolean;sprint:boolean;sneak:boolean;up:boolean;down:boolean};
export const emptyInput=():MoveInput=>({forward:0,strafe:0,jump:false,sprint:false,sneak:false,up:false,down:false});
export class PlayerBody{
  readonly position:Vec3;readonly velocity:Vec3={x:0,y:0,z:0};
  yaw=0;pitch=0;onGround=false;inWater=false;flying=false;health=20;hunger=20;oxygen=10;dead=false;
  fallStart:number|null=null;lastFall=0;distance=0;
  constructor(position:Vec3){this.position={...position};}
  get eye(){return{x:this.position.x,y:this.position.y+1.62,z:this.position.z};}
  collides(world:VoxelAccess,pos=this.position):boolean{
    const r=0.29,h=1.79;
    for(let x=Math.floor(pos.x-r);x<=Math.floor(pos.x+r);x++)for(let y=Math.floor(pos.y);y<=Math.floor(pos.y+h);y++)for(let z=Math.floor(pos.z-r);z<=Math.floor(pos.z+r);z++)if(blockAt(world.getBlock(x,y,z)).solid)return true;
    return false;
  }
  private moveAxis(world:VoxelAccess,axis:'x'|'y'|'z',amount:number):boolean{
    if(amount===0)return false;const steps=Math.max(1,Math.ceil(Math.abs(amount)/0.18));const delta=amount/steps;
    for(let i=0;i<steps;i++){this.position[axis]+=delta;if(this.collides(world)){this.position[axis]-=delta;if(axis==='y'&&delta<0)this.onGround=true;this.velocity[axis]=0;return true;}}
    return false;
  }
  step(world:VoxelAccess,input:MoveInput,dt:number,creative=false):{landed:number;inWater:boolean}{
    const before={...this.position};const feet=world.getBlock(Math.floor(this.position.x),Math.floor(this.position.y+0.15),Math.floor(this.position.z));
    this.inWater=!!blockAt(feet).liquid;
    const length=Math.hypot(input.forward,input.strafe)||1;const forward=input.forward/length,strafe=input.strafe/length;
    let speed=creative&&this.flying?11:input.sprint?6.2:input.sneak?1.7:4.35;if(this.inWater)speed*=0.55;
    const dx=(-Math.sin(this.yaw)*forward+Math.cos(this.yaw)*strafe)*speed;
    const dz=(-Math.cos(this.yaw)*forward-Math.sin(this.yaw)*strafe)*speed;
    const accel=this.onGround||this.flying?18:7;
    this.velocity.x+=(dx-this.velocity.x)*Math.min(1,accel*dt);this.velocity.z+=(dz-this.velocity.z)*Math.min(1,accel*dt);
    let landed=0;
    if(this.flying){this.velocity.y=((input.up||input.jump?1:0)-(input.down||input.sneak?1:0))*8;}
    else if(this.inWater){this.velocity.y+=(-3-this.velocity.y)*Math.min(1,dt*4);if(input.jump)this.velocity.y=3.8;this.fallStart=null;}
    else{
      if(input.jump&&this.onGround){this.velocity.y=8.2;this.onGround=false;}
      this.velocity.y=Math.max(-32,this.velocity.y-24*dt);
    }
    const wasGround=this.onGround;this.onGround=false;
    this.moveAxis(world,'x',this.velocity.x*dt);this.moveAxis(world,'z',this.velocity.z*dt);
    if(!this.flying&&this.velocity.y<0&&!wasGround&&this.fallStart===null)this.fallStart=this.position.y;
    const impactVelocity=this.velocity.y;const hitY=this.moveAxis(world,'y',this.velocity.y*dt);
    if(hitY&&impactVelocity<0){landed=Math.max(0,(this.fallStart??this.position.y)-this.position.y-3);this.lastFall=landed;this.fallStart=null;}
    if(this.onGround&&this.velocity.y===0&&this.fallStart!==null&&wasGround)this.fallStart=null;
    if(this.flying)this.fallStart=null;
    if(this.position.y<-10){this.health=0;this.dead=true;}
    this.distance+=Math.hypot(this.position.x-before.x,this.position.z-before.z);
    return{landed,inWater:this.inWater};
  }
}
