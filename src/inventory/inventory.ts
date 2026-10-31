import type { Stack } from '../core/types';
export const ITEM_NAMES: Record<string, { label: string; stack: number; tool?: 'pickaxe'|'axe'|'shovel'|'sword'; level?: number; speed?: number; damage?: number; durability?: number; fuel?: number; food?: number; icon?: string }> = {
  stick: { label:'Stick', stack:64,fuel:5, icon:'stick' }, coal:{label:'Coal',stack:64,fuel:80,icon:'coal'},
  ironIngot:{label:'Iron ingot',stack:64,icon:'ingot'}, goldNugget:{label:'Gold nugget',stack:64,icon:'gold'},
  diamond:{label:'Diamond',stack:64,icon:'diamond'}, seeds:{label:'Seeds',stack:64,icon:'seeds'},
  wheat:{label:'Wheat',stack:64,icon:'wheat'}, bread:{label:'Bread',stack:64,food:6,icon:'bread'},
  apple:{label:'Apple',stack:64,food:4,icon:'apple'}, rawPork:{label:'Raw pork',stack:64,food:3,icon:'meat'},
  cookedPork:{label:'Cooked pork',stack:64,food:8,icon:'meat'}, rottenFlesh:{label:'Rotten flesh',stack:64,food:2,icon:'meat'},
  reeds:{label:'Sugar cane',stack:64,icon:'reeds'},
  woodenPickaxe:{label:'Wooden pickaxe',stack:1,tool:'pickaxe',level:1,speed:3,damage:2,durability:60,icon:'pickaxe'},
  stonePickaxe:{label:'Stone pickaxe',stack:1,tool:'pickaxe',level:2,speed:5,damage:3,durability:132,icon:'pickaxe'},
  ironPickaxe:{label:'Iron pickaxe',stack:1,tool:'pickaxe',level:3,speed:8,damage:4,durability:251,icon:'pickaxe'},
  woodenAxe:{label:'Wooden axe',stack:1,tool:'axe',level:1,speed:3,damage:3,durability:60,icon:'axe'},
  stoneAxe:{label:'Stone axe',stack:1,tool:'axe',level:2,speed:5,damage:4,durability:132,icon:'axe'},
  woodenShovel:{label:'Wooden shovel',stack:1,tool:'shovel',level:1,speed:3,damage:2,durability:60,icon:'shovel'},
  stoneShovel:{label:'Stone shovel',stack:1,tool:'shovel',level:2,speed:5,damage:3,durability:132,icon:'shovel'},
  woodenSword:{label:'Wooden sword',stack:1,tool:'sword',level:1,speed:1,damage:5,durability:60,icon:'sword'},
  ironSword:{label:'Iron sword',stack:1,tool:'sword',level:3,speed:1,damage:8,durability:251,icon:'sword'},
};
const BLOCK_FUEL: Record<string, number> = { planks: 15, oakLog: 15, birchLog: 15, spruceLog: 15, craftingTable: 15, oakLeaves: 3, birchLeaves: 3, spruceLeaves: 3 };
const blockLabel = (name: string) => { const spaced = name.replace(/([a-z])([A-Z])/g, '$1 $2'); return spaced.charAt(0).toUpperCase() + spaced.slice(1); };
export const itemDef = (id: string) => id.startsWith('block:') ? { label:blockLabel(id.slice(6)), stack:64, fuel:BLOCK_FUEL[id.slice(6)] ?? 0 } : ITEM_NAMES[id] ?? {label:id,stack:64};
export const copyStack = (stack: Stack | null): Stack | null => stack ? {...stack} : null;
export const sameKind = (a: Stack | null, b: Stack | null) => !!a && !!b && a.id === b.id && itemDef(a.id).stack > 1;

export class Inventory {
  readonly slots: (Stack|null)[];
  constructor(size = 36, initial?: (Stack|null)[]) {
    this.slots = Array.from({length:size},(_,i)=>copyStack(initial?.[i] ?? null));
    for(const slot of this.slots) if(slot && (slot.count <= 0 || slot.count > itemDef(slot.id).stack)) throw new Error('Invalid item stack');
  }
  add(id: string, count: number): number {
    if(!Number.isInteger(count) || count < 0) throw new Error('Invalid item count');
    const max = itemDef(id).stack;
    for(let pass=0;pass<2 && count>0;pass++) for(let i=0;i<this.slots.length && count>0;i++) {
      const slot=this.slots[i];
      if(pass===0 && slot?.id===id && slot.count<max) { const moved=Math.min(count,max-slot.count);slot.count+=moved;count-=moved; }
      else if(pass===1 && !slot) { const moved=Math.min(count,max);this.slots[i]={id,count:moved};count-=moved; }
    }
    return count;
  }
  count(id: string): number { return this.slots.reduce((sum,s)=>sum+(s?.id===id?s.count:0),0); }
  remove(id: string, count: number): boolean {
    if(this.count(id)<count) return false;
    for(let i=this.slots.length-1;i>=0 && count>0;i--) { const s=this.slots[i];if(s?.id===id){const taken=Math.min(count,s.count);s.count-=taken;count-=taken;if(s.count===0)this.slots[i]=null;} }
    return true;
  }
  move(from: number, to: number, amount?: number): boolean {
    const source=this.slots[from];if(!source || from===to || from<0 || to<0 || from>=this.slots.length || to>=this.slots.length) return false;
    const target=this.slots[to]; const count=Math.min(amount ?? source.count,source.count);
    if(count<=0)return false;
    if(!target){this.slots[to]=count===source.count?source:{...source,count};this.slots[from]=count===source.count?null:{...source,count:source.count-count};return true;}
    if(sameKind(source,target)){const moved=Math.min(count,itemDef(source.id).stack-target.count);if(moved<=0)return false;target.count+=moved;source.count-=moved;if(source.count===0)this.slots[from]=null;return true;}
    if(amount!==undefined && amount<source.count)return false;
    this.slots[from]=target;this.slots[to]=source;return true;
  }
  split(from:number,to:number):boolean { const s=this.slots[from];return !!s && s.count>1 && this.move(from,to,Math.floor(s.count/2)); }
  quickMove(from:number):boolean {
    const source=this.slots[from];if(!source)return false;
    const start=from<9?9:0,end=from<9?this.slots.length:9;
    const original={...source};
    for(let i=start;i<end && this.slots[from];i++) if(this.slots[i]?.id===source.id)this.move(from,i);
    for(let i=start;i<end && this.slots[from];i++) if(!this.slots[i])this.move(from,i);
    return this.slots[from]?.count!==original.count || this.slots[from]?.id!==original.id;
  }
  damage(index:number,amount=1):boolean {
    const stack=this.slots[index];if(!stack || !ITEM_NAMES[stack.id]?.durability)return false;
    const durability=(stack.durability ?? ITEM_NAMES[stack.id].durability!)-amount;
    if(durability<=0)this.slots[index]=null;else stack.durability=durability;
    return true;
  }
  clear():(Stack|null)[] { const old=this.slots.map(copyStack);this.slots.fill(null);return old; }
}
