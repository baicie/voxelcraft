import type { Stack } from '../core/types';
export type Recipe = { id:string; width:number; height:number; shaped:boolean; pattern:(string|null)[]; result:Stack; table?:boolean };
const stack=(id:string,count=1):Stack=>({id,count});
export const RECIPES:Recipe[]=[
  {id:'planks',width:1,height:1,shaped:false,pattern:['block:oakLog'],result:stack('block:planks',4)},
  {id:'birch-planks',width:1,height:1,shaped:false,pattern:['block:birchLog'],result:stack('block:planks',4)},
  {id:'spruce-planks',width:1,height:1,shaped:false,pattern:['block:spruceLog'],result:stack('block:planks',4)},
  {id:'sticks',width:1,height:2,shaped:true,pattern:['block:planks','block:planks'],result:stack('stick',4)},
  {id:'table',width:2,height:2,shaped:true,pattern:['block:planks','block:planks','block:planks','block:planks'],result:stack('block:craftingTable')},
  {id:'wood-pickaxe',table:true,width:3,height:3,shaped:true,pattern:['block:planks','block:planks','block:planks',null,'stick',null,null,'stick',null],result:stack('woodenPickaxe')},
  {id:'stone-pickaxe',table:true,width:3,height:3,shaped:true,pattern:['block:cobble','block:cobble','block:cobble',null,'stick',null,null,'stick',null],result:stack('stonePickaxe')},
  {id:'iron-pickaxe',table:true,width:3,height:3,shaped:true,pattern:['ironIngot','ironIngot','ironIngot',null,'stick',null,null,'stick',null],result:stack('ironPickaxe')},
  {id:'wood-axe',table:true,width:2,height:3,shaped:true,pattern:['block:planks','block:planks','block:planks','stick',null,'stick'],result:stack('woodenAxe')},
  {id:'stone-axe',table:true,width:2,height:3,shaped:true,pattern:['block:cobble','block:cobble','block:cobble','stick',null,'stick'],result:stack('stoneAxe')},
  {id:'wood-shovel',table:true,width:1,height:3,shaped:true,pattern:['block:planks','stick','stick'],result:stack('woodenShovel')},
  {id:'stone-shovel',table:true,width:1,height:3,shaped:true,pattern:['block:cobble','stick','stick'],result:stack('stoneShovel')},
  {id:'wood-sword',table:true,width:1,height:3,shaped:true,pattern:['block:planks','block:planks','stick'],result:stack('woodenSword')},
  {id:'iron-sword',table:true,width:1,height:3,shaped:true,pattern:['ironIngot','ironIngot','stick'],result:stack('ironSword')},
  {id:'furnace',table:true,width:3,height:3,shaped:true,pattern:['block:cobble','block:cobble','block:cobble','block:cobble',null,'block:cobble','block:cobble','block:cobble','block:cobble'],result:stack('block:furnace')},
  {id:'torch',width:1,height:2,shaped:true,pattern:['coal','stick'],result:stack('block:torch',4)},
  {id:'glass',width:1,height:1,shaped:false,pattern:['block:glass'],result:stack('block:glass')},
  {id:'stone-bricks',width:2,height:2,shaped:true,pattern:['block:stone','block:stone','block:stone','block:stone'],result:stack('block:stoneBrick',4)},
  {id:'bricks',width:2,height:2,shaped:true,pattern:['block:clay','block:clay','block:clay','block:clay'],result:stack('block:brick')},
  {id:'bread',table:true,width:3,height:1,shaped:true,pattern:['wheat','wheat','wheat'],result:stack('bread')},
];
function ingredientAt(grid:(Stack|null)[],size:number,recipe:Recipe,x:number,y:number):string|null{
  if(x>=recipe.width||y>=recipe.height)return null;
  return grid[x+y*size]?.id??null;
}
export function matches(grid:(Stack|null)[],size:number,recipe:Recipe):boolean{
  if(recipe.table&&size<3)return false;
  if(recipe.shaped){
    let minX=size,minY=size,maxX=-1,maxY=-1;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(grid[x+y*size]){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    if(maxX<0)return false;
    if(maxX-minX+1!==recipe.width||maxY-minY+1!==recipe.height)return false;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const expected=ingredientAt(grid,size,recipe,x-minX,y-minY);
      if((grid[x+y*size]?.id??null)!==expected)return false;
    }
    return true;
  }
  const actual=grid.filter(Boolean).map(s=>s!.id).sort(),expected=recipe.pattern.filter(Boolean).sort();
  return actual.length===expected.length&&actual.every((id,i)=>id===expected[i]);
}
export function findRecipe(grid:(Stack|null)[],size:number):Recipe|undefined{return RECIPES.find(r=>matches(grid,size,r));}
export function craft(grid:(Stack|null)[],size:number):Stack|null{
  const recipe=findRecipe(grid,size);if(!recipe)return null;
  for(const required of recipe.pattern){if(!required)continue;const index=grid.findIndex(s=>s?.id===required);if(index<0)return null;const s=grid[index]!;s.count--;if(s.count===0)grid[index]=null;}
  return {...recipe.result};
}
export function returnIngredients(grid:(Stack|null)[],add:(id:string,count:number)=>number):void{for(const s of grid)if(s){const remaining=add(s.id,s.count);if(remaining)throw new Error('Cannot return crafting materials');}grid.fill(null);}
