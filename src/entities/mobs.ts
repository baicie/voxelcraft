import { CHUNK_SIZE, type Vec3 } from '../core/types';
import { hash3 } from '../core/math';
import type { VoxelAccess } from '../world/world';
type MobWorld = VoxelAccess & { isSolid(x:number,y:number,z:number):boolean; getLoadedBlock(x:number,y:number,z:number):number|null };
export type MobKind='pig'|'sheep'|'wolf'|'zombie';
export type MobState='wander'|'flee'|'chase'|'attack';
export type Mob={id:number;kind:MobKind;position:Vec3;velocity:Vec3;yaw:number;health:number;state:MobState;timer:number;attackCooldown:number;hurt:number;alive:boolean;grounded:boolean};
const DEF={pig:{health:10,speed:1.2,hostile:false,drop:'rawPork'},sheep:{health:8,speed:1,hostile:false,drop:'wheat'},wolf:{health:12,speed:2,hostile:false,drop:'rottenFlesh'},zombie:{health:20,speed:1.85,hostile:true,drop:'rottenFlesh'}};
export class MobSystem{
  readonly mobs:Mob[]=[];private nextId=1;private spawnTimer=0;
  constructor(private seed:number){}
  spawn(kind:MobKind,position:Vec3):Mob{const mob:Mob={id:this.nextId++,kind,position:{...position},velocity:{x:0,y:0,z:0},yaw:0,health:DEF[kind].health,state:'wander',timer:0,attackCooldown:0,hurt:0,alive:true,grounded:false};this.mobs.push(mob);return mob;}
  private collide(world:MobWorld,mob:Mob,pos:Vec3):boolean{const r=mob.kind==='pig'?0.42:0.32,h=mob.kind==='pig'?0.85:1.65;for(let x=Math.floor(pos.x-r);x<=Math.floor(pos.x+r);x++)for(let y=Math.floor(pos.y);y<=Math.floor(pos.y+h);y++)for(let z=Math.floor(pos.z-r);z<=Math.floor(pos.z+r);z++)if(world.isSolid(x,y,z))return true;return false;}
  private move(world:MobWorld,mob:Mob,dt:number){
    const oldY=mob.position.y;mob.velocity.y=Math.max(-25,mob.velocity.y-22*dt);
    for(const axis of ['x','z'] as const){mob.position[axis]+=mob.velocity[axis]*dt;if(this.collide(world,mob,mob.position)){mob.position[axis]-=mob.velocity[axis]*dt;if(mob.grounded&&Math.abs(mob.velocity[axis])>0.2)mob.velocity.y=7;else mob.yaw+=1.7;}}
    mob.position.y+=mob.velocity.y*dt;mob.grounded=false;if(this.collide(world,mob,mob.position)){mob.position.y=oldY;if(mob.velocity.y<0)mob.grounded=true;mob.velocity.y=0;}
    if(mob.position.y<-5||mob.position.y>90)mob.alive=false;
  }
  update(world:MobWorld,dt:number,player:Vec3,night:boolean,onAttack:(damage:number)=>void,onDrops:(kind:MobKind,position:Vec3)=>void):void{
    this.spawnTimer-=dt;
    if(this.spawnTimer<=0&&this.mobs.length<24){this.spawnTimer=3;const angle=hash3(this.seed,this.nextId,Math.floor(player.x))*Math.PI*2;const distance=12+hash3(this.seed+1,this.nextId,Math.floor(player.z))*18;const x=Math.floor(player.x+Math.cos(angle)*distance),z=Math.floor(player.z+Math.sin(angle)*distance);if(world.getLoadedBlock(x,30,z)!==null){let y=60;while(y>2&&!world.isSolid(x,y,z))y--;if(y>27&&y<60){const r=hash3(this.seed+2,x,z);const kind:MobKind=night&&r>.35?'zombie':r>.75?'wolf':r>.35?'pig':'sheep';if(Math.hypot(x-player.x,z-player.z)>10)this.spawn(kind,{x:x+.5,y:y+1.01,z:z+.5});}}}
    for(const mob of this.mobs){if(!mob.alive)continue;mob.timer-=dt;mob.attackCooldown=Math.max(0,mob.attackCooldown-dt);mob.hurt=Math.max(0,mob.hurt-dt);
      const dx=player.x-mob.position.x,dz=player.z-mob.position.z,dist=Math.hypot(dx,dz);const def=DEF[mob.kind];
      if(mob.kind==='zombie'&&dist<18){mob.state=dist<1.55?'attack':'chase';mob.yaw=Math.atan2(dx,dz);if(dist<1.65&&mob.attackCooldown<=0){mob.attackCooldown=1.1;onAttack(3);}}
      else if(mob.state==='flee'&&mob.timer>0){/* retain flee direction */}
      else if(mob.kind==='wolf'&&dist<4&&mob.hurt>0){mob.state='chase';mob.yaw=Math.atan2(dx,dz);if(dist<1.6&&mob.attackCooldown<=0){mob.attackCooldown=1.2;onAttack(2);}}
      else{mob.state='wander';if(mob.timer<=0){mob.timer=2+hash3(this.seed,mob.id,Math.floor(mob.position.x))*4;mob.yaw+=hash3(this.seed+3,mob.id,Math.floor(mob.position.z))*3-1.5;}}
      const moving=mob.state!=='attack';const speed=def.speed*(mob.state==='flee'?1.8:mob.state==='chase'?1.25:0.55);
      mob.velocity.x=moving?Math.sin(mob.yaw)*speed:0;mob.velocity.z=moving?Math.cos(mob.yaw)*speed:0;
      this.move(world,mob,dt);if(mob.health<=0){mob.alive=false;onDrops(mob.kind,mob.position);}
    }
    this.mobs.splice(0,this.mobs.length,...this.mobs.filter(m=>m.alive&&Math.hypot(m.position.x-player.x,m.position.z-player.z)<80&&world.getLoadedBlock(Math.floor(m.position.x),Math.floor(m.position.y),Math.floor(m.position.z))!==null));
  }
  hit(mob:Mob,damage:number,knockback:Vec3):boolean{if(!mob.alive)return false;mob.health-=damage;mob.hurt=5;mob.state=mob.kind==='zombie'||mob.kind==='wolf'?'chase':'flee';mob.timer=3;mob.velocity.x+=knockback.x*5;mob.velocity.z+=knockback.z*5;mob.velocity.y=4;mob.yaw=Math.atan2(-knockback.x,-knockback.z);return true;}
  nearest(origin:Vec3,direction:Vec3,maxDistance=3.5):Mob|null{let best:Mob|null=null,bestScore=maxDistance;for(const mob of this.mobs){const dx=mob.position.x-origin.x,dy=mob.position.y+0.8-origin.y,dz=mob.position.z-origin.z;const along=dx*direction.x+dy*direction.y+dz*direction.z;if(along<0||along>maxDistance)continue;const side=Math.hypot(dx-direction.x*along,dy-direction.y*along,dz-direction.z*along);if(side<0.8&&along<bestScore){best=mob;bestScore=along;}}return best;}
  dispose(){this.mobs.length=0;}
}
export const MOB_CHUNK_RANGE=CHUNK_SIZE*4;
