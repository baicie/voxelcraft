import type { FurnaceState, Stack } from '../core/types';
import { itemDef } from '../inventory/inventory';
export const SMELTING:Record<string,Stack>={ 'block:ironOre':{id:'ironIngot',count:1}, 'block:sand':{id:'block:glass',count:1}, rawPork:{id:'cookedPork',count:1}, 'block:clay':{id:'block:brick',count:1} };
export const emptyFurnace=():FurnaceState=>({input:null,fuel:null,output:null,burn:0,burnMax:0,progress:0});
export function furnaceTick(f:FurnaceState,dt:number):boolean{
  const recipe=f.input?SMELTING[f.input.id]:undefined;
  const canOutput=!!recipe&&!!f.input&&(!f.output||(f.output.id===recipe.id&&f.output.count<itemDef(recipe.id).stack));
  if(f.burn<=0&&recipe&&canOutput&&f.fuel){
    const burn=itemDef(f.fuel.id).fuel??0;
    if(burn>0){f.burn=burn;f.burnMax=burn;f.fuel.count--;if(f.fuel.count===0)f.fuel=null;}
  }
  if(f.burn>0&&recipe&&canOutput){
    f.burn=Math.max(0,f.burn-dt);f.progress+=dt;
    if(f.progress>=10){f.progress-=10;if(f.output)f.output.count++;else f.output={...recipe};f.input!.count--;if(f.input!.count===0)f.input=null;}
    return true;
  }
  f.progress=Math.max(0,f.progress-dt*1.5);
  if(f.burn>0)f.burn=Math.max(0,f.burn-dt);
  return false;
}
export function takeFurnaceOutput(f:FurnaceState):Stack|null{const result=f.output;f.output=null;return result;}
