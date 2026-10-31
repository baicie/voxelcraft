import { clamp } from '../core/math';
export type DamageCause='fall'|'drowning'|'mob'|'starvation'|'void';
export class Survival{
  health=20;hunger=20;oxygen=10;dead=false;private hungerClock=0;private regenClock=0;private damageCooldown=0;private starveClock=0;
  constructor(state?:Partial<Pick<Survival,'health'|'hunger'|'oxygen'>>){Object.assign(this,state);}
  tick(dt:number,inWater:boolean,moving:boolean):{damage:number;cause:DamageCause}|null{
    this.damageCooldown=Math.max(0,this.damageCooldown-dt);this.hungerClock+=dt*(moving?1.15:1);this.regenClock+=dt;
    if(this.hungerClock>45){this.hungerClock=0;this.hunger=clamp(this.hunger-1,0,20);}
    if(this.hunger>17&&this.health<20&&this.regenClock>4){this.regenClock=0;this.health=Math.min(20,this.health+1);this.hunger=Math.max(0,this.hunger-0.5);}
    if(inWater)this.oxygen=Math.max(0,this.oxygen-dt);else this.oxygen=Math.min(10,this.oxygen+dt*3);
    if(this.oxygen<=0&&this.damageCooldown<=0){this.damageCooldown=1;return this.applyDamage(2,'drowning');}
    if(this.hunger<=0){this.starveClock+=dt;if(this.starveClock>4){this.starveClock=0;return this.applyDamage(1,'starvation');}}else this.starveClock=0;
    return null;
  }
  applyDamage(amount:number,cause:DamageCause):{damage:number;cause:DamageCause}|null{
    if(this.dead||amount<=0)return null;if(cause==='mob'&&this.damageCooldown>0)return null;
    this.health=clamp(this.health-amount,0,20);if(cause==='mob')this.damageCooldown=0.5;if(this.health===0)this.dead=true;return{damage:amount,cause};
  }
  eat(food:number):boolean{if(this.dead||this.hunger>=20||food<=0)return false;this.hunger=clamp(this.hunger+food,0,20);return true;}
  respawn(){this.health=20;this.hunger=20;this.oxygen=10;this.dead=false;this.damageCooldown=2;this.hungerClock=0;this.starveClock=0;}
}
export function attackDamage(base:number,cooldown:number):number{return cooldown>=0.55?base:0;}
