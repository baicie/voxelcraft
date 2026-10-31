import * as THREE from 'three';
import { TILE_NAMES } from '../world/mesher';
const palettes:Record<string,[string,string]>={
 grass_side:['#79583a','#648e3b'],grass_top:['#6e9e45','#91b957'],dirt:['#79583a','#96704a'],stone:['#7d8585','#969b96'],sand:['#d6c187','#ead9a5'],sandstone:['#c4ac72','#deca91'],snow_side:['#806346','#e0edf0'],snow_top:['#d7e8ed','#f4faf8'],log_side:['#695038','#866342'],log_top:['#b38b5c','#8a6744'],leaves:['#3d703d','#60954c'],planks:['#b88d58','#d0a66a'],birch_side:['#d9d4b8','#807d68'],birch_leaves:['#739b4b','#9db763'],cactus:['#3d7848','#69a25a'],gravel:['#8c837d','#a39a8c'],coal_ore:['#767e7e','#323b3c'],iron_ore:['#7c8483','#c09b79'],gold_ore:['#7d8585','#e7bf43'],diamond_ore:['#74807f','#4ed9d0'],cobble:['#697575','#909996'],bedrock:['#3d4849','#697272'],water:['#347da4','#62b5cf'],glass:['#c2e4e3','#eefcf5'],brick:['#a35342','#c3775d'],crafting_side:['#8d623e','#c59558'],crafting_top:['#aa814b','#644f37'],furnace:['#646e6d','#9a9e91'],torch:['#b07a38','#ffd46b'],tall_grass:['#4f873f','#86aa4c'],flower_red:['#518643','#e55d51'],flower_yellow:['#598b43','#f2d452'],farmland:['#65492e','#8e653b'],wheat:['#bea345','#e2cc6d'],clay:['#9aa7ab','#bbc4c2'],moss:['#66756a','#799552'],stone_brick:['#788381','#a0a79e'],spruce_side:['#4c3c2b','#6e5539'],spruce_leaves:['#2f5d50','#517967'],ice:['#95c9da','#c5e7ea'],glowstone:['#c79645','#ffe5a0'],obsidian:['#302b43','#51476b'],reeds:['#6b9b54','#a5c76e'],
};
function rand(seed:number){let state=seed;return()=>{state=Math.imul(state^state>>>15,1|state);state^=state+Math.imul(state^state>>>7,61|state);return((state^state>>>14)>>>0)/4294967296;};}
export function createAtlas():{texture:THREE.CanvasTexture;canvas:HTMLCanvasElement}{
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d')!;
 TILE_NAMES.forEach((name,index)=>{const x=index%8*16,y=Math.floor(index/8)*16;const random=rand(index*177+31);const [base,detail]=palettes[name]??['#ff00ff','#000'];ctx.fillStyle=base;ctx.fillRect(x,y,16,16);
  if(name==='air'){ctx.clearRect(x,y,16,16);return;}
  if(name==='glass'){ctx.clearRect(x,y,16,16);ctx.fillStyle='rgba(190,230,231,.16)';ctx.fillRect(x,y,16,16);ctx.strokeStyle='#b8d9d5';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,15,15);ctx.fillStyle='#ecffff';ctx.fillRect(x+2,y+2,5,1);ctx.fillRect(x+2,y+3,1,4);return;}
  if(['tall_grass','flower_red','flower_yellow','wheat','reeds','torch'].includes(name)){ctx.clearRect(x,y,16,16);ctx.fillStyle=base;if(name==='torch'){ctx.fillRect(x+7,y+5,2,10);ctx.fillStyle=detail;ctx.fillRect(x+6,y+2,4,4);ctx.fillStyle='#fff0ac';ctx.fillRect(x+7,y+2,2,2);}else{for(let i=0;i<(name==='wheat'?8:5);i++){const px=x+2+Math.floor(random()*12);ctx.fillRect(px,y+5+Math.floor(random()*4),1,10);ctx.fillRect(px-1,y+6+Math.floor(random()*4),2,1);}ctx.fillStyle=detail;if(name.startsWith('flower')){for(let i=0;i<5;i++)ctx.fillRect(x+4+Math.floor(random()*8),y+2+Math.floor(random()*5),3,3);}else for(let i=0;i<6;i++)ctx.fillRect(x+2+Math.floor(random()*12),y+3+Math.floor(random()*7),2,2);}return;}
  for(let i=0;i<65;i++){ctx.fillStyle=random()>.48?detail:base;ctx.globalAlpha=.2+random()*.35;ctx.fillRect(x+Math.floor(random()*16),y+Math.floor(random()*16),random()>.85?2:1,1);}ctx.globalAlpha=1;
  if(name==='grass_side'||name==='snow_side'){ctx.fillStyle=detail;ctx.fillRect(x,y,16,3);for(let i=0;i<16;i++)if(random()>.45)ctx.fillRect(x+i,y+3,1,Math.floor(random()*3));}
  if(name==='log_top'){ctx.strokeStyle=detail;ctx.lineWidth=1;ctx.strokeRect(x+2.5,y+2.5,11,11);ctx.strokeRect(x+5.5,y+5.5,5,5);ctx.fillStyle=detail;ctx.fillRect(x+8,y+7,1,3);}
  if(name==='planks'||name==='brick'||name==='stone_brick'){ctx.fillStyle=detail;for(let row=4;row<16;row+=5)ctx.fillRect(x,y+row,16,1);if(name!=='planks')for(let row=0;row<16;row+=5)for(let col=(row/5)%2?4:10;col<16;col+=10)ctx.fillRect(x+col,y+row,1,5);}
  if(name==='cobble'||name==='moss'){ctx.strokeStyle='#525f5d';for(let i=0;i<7;i++){const px=x+Math.floor(random()*12),py=y+Math.floor(random()*12);ctx.strokeRect(px,py,3+Math.floor(random()*4),3+Math.floor(random()*3));}}
  if(name.includes('ore')){ctx.fillStyle=detail;for(let i=0;i<8;i++){const px=x+1+Math.floor(random()*12),py=y+1+Math.floor(random()*12);ctx.fillRect(px,py,2,3);ctx.fillRect(px-1,py+1,4,1);}}
  if(name==='water'){ctx.fillStyle=detail;ctx.globalAlpha=.32;for(let i=0;i<6;i++)ctx.fillRect(x,y+1+i*3,8+Math.floor(random()*8),1);ctx.globalAlpha=1;}
  if(name==='leaves'||name==='birch_leaves'||name==='spruce_leaves'){for(let i=0;i<22;i++)if(random()>.5)ctx.clearRect(x+Math.floor(random()*16),y+Math.floor(random()*16),1,1);}
  if(name==='birch_side'){ctx.fillStyle=detail;for(let i=0;i<9;i++)ctx.fillRect(x+Math.floor(random()*12),y+Math.floor(random()*16),3+Math.floor(random()*3),1);}
  if(name==='furnace'){ctx.fillStyle='#343f40';ctx.fillRect(x+3,y+6,10,7);ctx.fillStyle='#252e30';ctx.fillRect(x+5,y+8,6,4);ctx.fillStyle='#b3b6a7';ctx.fillRect(x+3,y+2,10,2);}
  if(name==='crafting_top'){ctx.strokeStyle=detail;ctx.strokeRect(x+2.5,y+2.5,11,11);ctx.beginPath();ctx.moveTo(x+8,y+3);ctx.lineTo(x+8,y+13);ctx.moveTo(x+3,y+8);ctx.lineTo(x+13,y+8);ctx.stroke();}
 });
 const texture=new THREE.CanvasTexture(canvas);texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestMipmapLinearFilter;colorSpace(texture);texture.generateMipmaps=true;return{texture,canvas};
}
function colorSpace(texture:THREE.CanvasTexture){texture.colorSpace=THREE.SRGBColorSpace;}
const iconCache = new Map<string, string>();
export function itemIcon(id: string): string {
 const cached = iconCache.get(id); if (cached) return cached;
 const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d')!;ctx.imageSmoothingEnabled=false;
 if(id.startsWith('block:')){const name=id.slice(6);const index=Object.entries(BLOCK_NAME_TO_TEXTURE).find(([block])=>block===name)?.[1]??0;const tile=typeof index==='number'?index:0;const atlas=createAtlas().canvas;ctx.drawImage(atlas,tile%8*16,Math.floor(tile/8)*16,16,16,6,6,52,52);const result=canvas.toDataURL();iconCache.set(id,result);return result;}
 const tool=id.toLowerCase();ctx.translate(32,32);ctx.rotate(-Math.PI/4);ctx.fillStyle='#ba8d55';ctx.fillRect(-3,-4,6,28);ctx.fillStyle=id.startsWith('wooden')?'#c6a36c':id.startsWith('stone')?'#9aa29f':'#d3ddd7';
 if(tool.includes('pickaxe')){ctx.fillRect(-16,-19,32,6);ctx.fillRect(-16,-14,5,5);ctx.fillRect(11,-14,5,5);}else if(tool.includes('axe')){ctx.fillRect(-11,-20,17,12);ctx.fillRect(-11,-8,8,5);}else if(tool.includes('shovel')){ctx.fillRect(-6,-21,12,13);}else if(tool.includes('sword')){ctx.fillRect(-4,-27,8,30);ctx.fillRect(-10,0,20,4);}else{ctx.fillStyle='#cfb17a';ctx.fillRect(-4,-18,8,35);}return canvas.toDataURL();
}
import { B, blockAt } from '../world/blocks';
const BLOCK_NAME_TO_TEXTURE=Object.fromEntries(Object.values(B).map(id=>[blockAt(id).name,TILE_NAMES.indexOf(blockAt(id).top??blockAt(id).texture)]));
