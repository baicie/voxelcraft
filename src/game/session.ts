import * as THREE from 'three';
import type { PlayerSave, Stack, WorldMetadata, WorldSave, FurnaceState } from '../core/types';
import { CHUNK_SIZE, WORLD_HEIGHT } from '../core/types';
import { clamp, hashString } from '../core/math';
import { B, blockAt, blockByName } from '../world/blocks';
import { VoxelWorld } from '../world/world';
import { findSpawn, BIOMES } from '../world/generator';
import { raycast, type RayHit } from '../world/raycast';
import { Inventory, ITEM_NAMES, copyStack, itemDef, sameKind } from '../inventory/inventory';
import { RECIPES, craft, findRecipe, type Recipe } from '../crafting/recipes';
import { emptyFurnace, furnaceTick, SMELTING } from '../crafting/furnace';
import { PlayerBody, emptyInput } from '../player/physics';
import { Survival } from '../survival/survival';
import { MobSystem, type MobKind } from '../entities/mobs';
import { DropSystem } from '../entities/drops';
import { WorldStorage } from '../persistence/storage';
import { createAtlas, itemIcon } from '../render/atlas';
import { ChunkRenderer } from '../render/chunkRenderer';
import { SkySystem } from '../render/sky';
import { Particles } from '../render/particles';
import { MobRenderer, blockParticleColor } from '../render/entityRenderer';
import { DropRenderer } from '../render/dropRenderer';
import { AudioEngine } from '../audio/audio';
import type { HudView, InventorySource, InventoryView, UiActions, FurnaceView, UI } from '../ui/ui';

export type Settings = { sensitivity: number; volume: number; renderDistance: number; muted: boolean };
export type SessionOptions = {
  metadata: WorldMetadata; save: WorldSave; storage: WorldStorage; host: HTMLElement; ui: UI;
  audio: AudioEngine; settings: Settings;
  onReady(): void;
  onProgress?(progress: number): void;
  onSaveError(message: string): void;
  onExitRequested(): void;
  onWorldUpdated(): void;
};
const DAY_SECONDS = 600;
function formatClock(seconds: number): string {
  const hours = (seconds / DAY_SECONDS * 24 + 6) % 24;
  return `${String(Math.floor(hours)).padStart(2, '0')}:${String(Math.floor((hours % 1) * 60)).padStart(2, '0')}`;
}
function extractStacks(inventory: Inventory): (Stack | null)[] { return inventory.slots.map(copyStack); }
function makeCreativeInventory(): (Stack | null)[] {
  const slots: (Stack | null)[] = Array.from({ length: 36 }, () => null);
  const ids = ['woodenPickaxe','stonePickaxe','ironPickaxe','woodenSword','block:planks','block:stoneBrick','block:glass','block:torch','block:craftingTable','block:furnace','block:oakLog','block:cobble','block:glowstone','ironIngot','coal','stick','apple','block:grass','block:sand','block:brick'];
  ids.slice(0, 9).forEach((id, i) => slots[i] = { id, count: id.startsWith('block:') ? 64 : 1 });
  ids.slice(9).forEach((id, i) => slots[i + 9] = { id, count: 1 });
  return slots;
}
function recipeAvailable(recipe: Recipe, inventory: Inventory): boolean {
  const counts = new Map<string, number>();
  for (const id of recipe.pattern) if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const [id, count] of counts) if (inventory.count(id) < count) return false;
  return true;
}

export class GameSession {
  readonly metadata: WorldMetadata;
  readonly world: VoxelWorld;
  readonly inventory: Inventory;
  readonly survival: Survival;
  readonly mobs: MobSystem;
  readonly drops = new DropSystem();
  readonly player: PlayerBody;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private chunkRenderer: ChunkRenderer;
  private sky: SkySystem;
  private particles: Particles;
  private mobRenderer: MobRenderer;
  private dropRenderer: DropRenderer;
  private highlight: THREE.LineSegments;
  private crack: THREE.Mesh;
  private hand = new THREE.Group();
  private handId = '';
  private audio: AudioEngine;
  private ui: UI;
  private storage: WorldStorage;
  private options: SessionOptions;
  private keys = new Set<string>();
  private running = true;
  private ready = false;
  private initial = false;
  private entered = false;
  private selectedSlot = 0;
  private worldTime: number;
  private autoSaveClock = 0;
  private lastFrame = performance.now();
  private accumulator = 0;
  private frameAvg = 16.7;
  private physicsTime = 0;
  private leftHeld = false;
  private target: RayHit | null = null;
  private miningKey = '';
  private miningProgress = 0;
  private mineSoundClock = 0;
  private attackCooldown = 0;
  private swing = 0;
  private stepDistance = 0;
  private lastSpace = 0;
  private flyEnabled = false;
  private deadHandled = false;
  private furnaces: Map<string, FurnaceState>;
  private openFurnaceKey: string | null = null;
  private craftGrid: (Stack | null)[] = Array.from({ length: 9 }, () => null);
  private craftSize: 2 | 3 = 2;
  private cursorStack: Stack | null = null;
  private lastHudUpdate = 0;
  private lastUiFurnace = 0;
  private saving: Promise<void> | null = null;
  private raf = 0;
  private lastProgress = 0;
  private disposed = false;
  private listeners: (() => void)[] = [];
  private crackTexture: THREE.CanvasTexture;
  private crackCanvas: HTMLCanvasElement;
  private resizeObserver: ResizeObserver;

  constructor(options: SessionOptions) {
    this.options = options;
    this.metadata = structuredClone(options.metadata);
    this.storage = options.storage;
    this.ui = options.ui;
    this.audio = options.audio;
    this.world = new VoxelWorld(hashString(options.metadata.seed), options.metadata.mode, options.save.edits);
    this.player = new PlayerBody(options.save.player.position);
    this.player.yaw = options.save.player.yaw;
    this.player.pitch = options.save.player.pitch;
    this.inventory = new Inventory(36, options.metadata.mode === 'creative' ? (options.save.player.inventory.some(Boolean) ? options.save.player.inventory : makeCreativeInventory()) : options.save.player.inventory);
    this.selectedSlot = clamp(options.save.player.selected, 0, 8);
    this.survival = new Survival({ health: options.save.player.health, hunger: options.save.player.hunger, oxygen: options.save.player.oxygen });
    this.worldTime = options.save.player.time || 20;
    this.mobs = new MobSystem(hashString(options.metadata.seed + ':mobs'));
    this.drops.restore(options.save.drops ?? []);
    this.furnaces = new Map(Object.entries(options.save.furnaces ?? {}));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(74, 1, .06, 420);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.host.appendChild(this.renderer.domElement);
    this.renderer.domElement.id = 'game-world';
    this.renderer.domElement.dataset.testid = 'game-world';
    const atlas = createAtlas();
    this.chunkRenderer = new ChunkRenderer(this.scene, this.world, atlas.texture, options.settings.renderDistance);
    this.sky = new SkySystem(this.scene);
    this.particles = new Particles(this.scene);
    this.mobRenderer = new MobRenderer(this.scene);
    this.dropRenderer = new DropRenderer(this.scene);
    this.highlight = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.005, 1.005, 1.005)), new THREE.LineBasicMaterial({ color: 0x0d1512, transparent: true, opacity: .72 }));
    this.highlight.visible = false; this.scene.add(this.highlight);
    this.crackCanvas = document.createElement('canvas'); this.crackCanvas.width = 32; this.crackCanvas.height = 32;
    this.crackTexture = new THREE.CanvasTexture(this.crackCanvas); this.crackTexture.magFilter = THREE.NearestFilter;
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.008, 1.008, 1.008), new THREE.MeshBasicMaterial({ map: this.crackTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    this.crack.visible = false; this.scene.add(this.crack);
    this.camera.add(this.hand);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(options.host);
    this.resize();
    this.bindEvents();
    this.chunkRenderer.onInitialReady = () => {
      if (!this.initial) {
        this.initial = true; this.ready = true; this.ui.showGame(); this.ui.showStartHint('Click to enter the world');
        this.options.onReady();
      }
    };
    this.updateHand();
    this.addActionHandlers();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  private host = document.querySelector('#game-canvas') as HTMLElement;

  private addActionHandlers() {
    const actions: UiActions = {
      onCreate: () => {}, onLoad: () => {}, onDelete: () => {}, onExport: () => {}, onImport: () => {},
      onResume: () => this.resume(),
      onSaveExit: () => { void this.save().then(() => this.options.onExitRequested()).catch(error => this.saveError(error)); },
      onReturnMenu: () => { void this.save().then(() => this.options.onExitRequested()).catch(error => this.saveError(error)); },
      onSettings: values => {
        Object.assign(this.options.settings, values);
        this.audio.setVolume(values.volume); this.audio.setMuted(values.muted);
        void this.storage.setSetting('settings', values).catch(() => this.ui.toast('Settings could not be saved.', 'error'));
      },
      onInventorySlot: (source, index, button, shift, x, y) => this.inventorySlot(source, index, button, shift, x, y),
      onCraftResult: shift => this.craftResult(shift),
      onFurnaceSlot: (slot, button, shift) => this.furnaceSlot(slot, button, shift),
      onCloseContainer: () => this.closeContainer(),
      onRespawn: () => this.respawn(),
      onDropItem: () => this.dropSelected(),
      onToggleDebug: () => {},
    };
    this.ui.setActions(actions);
    this.ui.applySettings(this.options.settings);
  }

  private bindEvents() {
    const canvas = this.renderer.domElement;
    const keydown = (event: KeyboardEvent) => {
      if (event.code === 'F3') { event.preventDefault(); this.toggleDebug(); return; }
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;
      if (this.ui.containerOpen) {
        if (event.code === 'KeyE' || event.code === 'Escape') { event.preventDefault(); this.closeContainer(); }
        return;
      }
      if (event.code === 'Escape') return;
      if (!this.isLocked || this.survival.dead) return;
      if (!event.repeat) this.keys.add(event.code);
      if (event.code.startsWith('Digit')) { const n = Number(event.code.slice(5)); if (n >= 1 && n <= 9) this.selectedSlot = n - 1; }
      if (event.code === 'KeyE') { event.preventDefault(); this.openBackpack(); }
      if (event.code === 'KeyQ') { event.preventDefault(); this.dropSelected(); }
      if (event.code === 'Space' && !event.repeat && this.metadata.mode === 'creative') {
        const now = performance.now();
        if (now - this.lastSpace < 280) { this.flyEnabled = !this.flyEnabled; this.player.velocity.y = 0; this.ui.toast(this.flyEnabled ? 'Flight enabled' : 'Flight disabled'); }
        this.lastSpace = now;
      }
      if (['KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ControlLeft'].includes(event.code)) event.preventDefault();
    };
    const keyup = (event: KeyboardEvent) => this.keys.delete(event.code);
    const mousedown = (event: MouseEvent) => {
      if (!this.isLocked || this.survival.dead) return;
      if (event.button === 0) { this.leftHeld = true; this.attackOrMine(true); }
      if (event.button === 2) { this.useOrPlace(); }
    };
    const mouseup = (event: MouseEvent) => {
      if (event.button === 0) { this.leftHeld = false; this.miningProgress = 0; this.miningKey = ''; }
    };
    const mousemove = (event: MouseEvent) => {
      if (!this.isLocked) return;
      const sensitivity = this.options.settings.sensitivity;
      this.player.yaw -= event.movementX * sensitivity;
      this.player.pitch = clamp(this.player.pitch - event.movementY * sensitivity, -1.55, 1.55);
    };
    const wheel = (event: WheelEvent) => {
      if (!this.isLocked) return;
      this.selectedSlot = (this.selectedSlot + (event.deltaY > 0 ? 1 : -1) + 9) % 9;
    };
    const click = () => {
      if (!this.ready || this.survival.dead || this.ui.anyScreen) return;
      if (!this.isLocked) this.lockPointer();
    };
    const pointerlock = () => {
      if (this.isLocked) { this.ui.hideStartHint(); return; }
      if (!this.entered || this.survival.dead || this.ui.containerOpen || !this.ui.settingsHidden) return;
      if (this.ui.pauseVisible) return;
      this.ui.showPause();
      this.keys.clear(); this.leftHeld = false;
    };
    const beforeUnload = () => { void this.save(); };
    const context = (event: Event) => event.preventDefault();
    document.addEventListener('keydown', keydown);
    document.addEventListener('keyup', keyup);
    document.addEventListener('mousemove', mousemove);
    document.addEventListener('wheel', wheel, { passive: true });
    document.addEventListener('pointerlockchange', pointerlock);
    document.addEventListener('contextmenu', context);
    window.addEventListener('beforeunload', beforeUnload);
    canvas.addEventListener('mousedown', mousedown);
    document.addEventListener('mouseup', mouseup);
    document.addEventListener('click', click);
    this.listeners.push(() => {
      document.removeEventListener('keydown', keydown); document.removeEventListener('keyup', keyup);
      document.removeEventListener('mousemove', mousemove); document.removeEventListener('wheel', wheel);
      document.removeEventListener('pointerlockchange', pointerlock); document.removeEventListener('contextmenu', context);
      window.removeEventListener('beforeunload', beforeUnload);
      canvas.removeEventListener('mousedown', mousedown); document.removeEventListener('mouseup', mouseup);
      document.removeEventListener('click', click);
    });
  }

  private lockPointer() {
    void this.audio.unlock();
    this.entered = true;
    this.renderer.domElement.requestPointerLock();
  }
  private get isLocked() { return document.pointerLockElement === this.renderer.domElement; }
  private resume() {
    this.ui.hidePause();
    if (this.ready && !this.survival.dead) this.lockPointer();
  }

  private openBackpack(table = false) {
    this.craftSize = table ? 3 : 2;
    this.cursorStack = null;
    this.closeFurnace(false);
    this.ui.openInventory(this.inventoryView());
    this.ui.setHeld(null);
    if (this.isLocked) document.exitPointerLock();
  }

  private openTable() { this.openBackpack(true); }
  private openFurnace(x: number, y: number, z: number) {
    const key = `${x},${y},${z}`;
    if (!this.furnaces.has(key)) this.furnaces.set(key, emptyFurnace());
    this.openFurnaceKey = key;
    this.cursorStack = null;
    this.ui.openFurnace(this.furnaceView(), extractStacks(this.inventory));
    this.ui.setHeld(null);
    if (this.isLocked) document.exitPointerLock();
  }
  private closeFurnace(refresh = true) { this.openFurnaceKey = null; if (refresh) this.ui.closeContainer(); }

  private closeContainer() {
    this.returnCraftGrid();
    if (this.cursorStack) {
      const left = this.inventory.add(this.cursorStack.id, this.cursorStack.count);
      if (left > 0) this.drops.spawn(this.cursorStack.id, left, this.player.eye);
      this.cursorStack = null;
    }
    this.ui.setHeld(null);
    this.ui.closeContainer();
    if (this.ready && !this.survival.dead) {
      this.lockPointer();
    }
  }
  private returnCraftGrid() {
    for (let i = 0; i < this.craftGrid.length; i++) {
      const stack = this.craftGrid[i]; if (!stack) continue;
      const left = this.inventory.add(stack.id, stack.count);
      if (left > 0) this.drops.spawn(stack.id, left, this.player.eye);
      this.craftGrid[i] = null;
    }
  }

  private activeCraft(): (Stack | null)[] {
    return this.craftSize === 2 ? this.craftGrid.slice(0, 4) : this.craftGrid;
  }
  private writeCraft(grid: (Stack | null)[]) {
    if (this.craftSize === 2) { for (let i = 0; i < 4; i++) this.craftGrid[i] = grid[i]; }
    else this.craftGrid = grid;
  }
  private inventoryView(): InventoryView {
    const active = this.activeCraft();
    const recipe = findRecipe(active, this.craftSize);
    return {
      slots: extractStacks(this.inventory), craft: [...this.craftGrid], craftSize: this.craftSize,
      result: recipe?.result ?? null, table: this.craftSize === 3,
      recipes: RECIPES.map(r => ({ id: r.id, result: r.result, available: recipeAvailable(r, this.inventory) })),
    };
  }
  private refreshInventory() {
    if (this.ui.inventoryOpen) this.ui.updateInventory(this.inventoryView());
  }
  private inventorySlot(source: InventorySource, index: number, button: number, shift: boolean, x: number, y: number) {
    if (source === 'inventory') {
      if (button === 0 && shift) { this.inventory.quickMove(index); this.refreshInventory(); return; }
      if (this.cursorStack && button === 2) {
        const accepted = this.inventory.add(this.cursorStack.id, 1);
        if (accepted === 0) { this.cursorStack.count--; if (!this.cursorStack.count) this.cursorStack = null; }
      } else if (this.cursorStack) {
        const target = this.inventory.slots[index];
        if (sameKind(this.cursorStack, target) && target) {
          const amount = Math.min(this.cursorStack.count, itemDef(target.id).stack - target.count);
          target.count += amount; this.cursorStack.count -= amount; if (!this.cursorStack.count) this.cursorStack = null;
        } else {
          this.inventory.slots[index] = this.cursorStack; this.cursorStack = target ? { ...target } : null;
        }
      } else {
        const target = this.inventory.slots[index];
        if (target) {
          const count = button === 2 ? Math.ceil(target.count / 2) : target.count;
          this.cursorStack = { ...target, count };
          target.count -= count; if (!target.count) this.inventory.slots[index] = null;
        }
      }
      this.audio.play('click'); this.updateHeld(x, y); this.refreshInventory(); return;
    }
    if (this.craftSize === 2 && ![0, 1, 2, 3].includes(index)) return;
    const slot = this.craftGrid[index];
    if (shift) {
      if (slot) { const left = this.inventory.add(slot.id, slot.count); slot.count = left; if (!slot.count) this.craftGrid[index] = null; this.audio.play('click'); this.refreshInventory(); }
      return;
    }
    if (this.cursorStack) {
      if (slot && sameKind(this.cursorStack, slot)) {
        const amount = Math.min(this.cursorStack.count, itemDef(slot.id).stack - slot.count);
        slot.count += amount; this.cursorStack.count -= amount; if (!this.cursorStack.count) this.cursorStack = null;
      } else { this.craftGrid[index] = this.cursorStack; this.cursorStack = slot ? { ...slot } : null; }
    } else if (slot) {
      const count = button === 2 ? Math.ceil(slot.count / 2) : slot.count;
      this.cursorStack = { ...slot, count }; slot.count -= count; if (!slot.count) this.craftGrid[index] = null;
    }
    this.updateHeld(x, y); this.refreshInventory();
  }
  private updateHeld(x: number, y: number) { this.ui.setHeld(this.cursorStack, x, y); }

  private craftResult(shift: boolean) {
    const active = this.activeCraft();
    const recipe = findRecipe(active, this.craftSize);
    if (!recipe) { this.ui.toast('The pattern does not match a recipe.', 'error'); return; }
    if (shift) {
      let crafts = 0;
      while (crafts < 64) {
        const grid = this.activeCraft().map(copyStack);
        const current = findRecipe(grid, this.craftSize); if (!current) break;
        const inventoryBefore = extractStacks(this.inventory);
        const gridBefore = this.activeCraft().map(copyStack);
        const output = craft(grid, this.craftSize);
        if (!output) break;
        const left = this.inventory.add(output.id, output.count);
        if (left > 0) {
          for (let i = 0; i < inventoryBefore.length; i++) this.inventory.slots[i] = copyStack(inventoryBefore[i]);
          this.writeCraft(gridBefore); break;
        }
        this.writeCraft(grid); crafts++;
      }
      if (crafts > 0) { this.audio.play('craft'); this.ui.toast(`Crafted ${crafts} time${crafts > 1 ? 's' : ''}`, 'success'); }
      else this.ui.toast('No room in your backpack.', 'error');
      this.updateHeld(-100, -100); this.refreshInventory(); return;
    }
    if (this.cursorStack && !sameKind(this.cursorStack, recipe.result)) { this.ui.toast('Your hand is already full.', 'error'); return; }
    const grid = this.activeCraft().map(copyStack);
    const output = craft(grid, this.craftSize);
    if (!output) return;
    if (this.cursorStack && itemDef(this.cursorStack.id).stack > 1 && this.cursorStack.id === output.id) {
      const accepted = Math.min(output.count, itemDef(output.id).stack - this.cursorStack.count);
      if (accepted < output.count) { this.ui.toast('Your hand is full.', 'error'); return; }
      this.cursorStack.count += output.count;
    } else if (this.cursorStack) { this.ui.toast('Your hand is already full.', 'error'); return; }
    else this.cursorStack = output;
    this.writeCraft(grid); this.audio.play('craft'); this.refreshInventory(); this.updateHeld(-100, -100);
  }

  private dropSelected() {
    const stack = this.inventory.slots[this.selectedSlot];
    if (!stack) return;
    const drop = { ...stack }; stack.count--; if (!stack.count) this.inventory.slots[this.selectedSlot] = null;
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
    const item = this.drops.spawn(drop.id, drop.count, { x: this.player.position.x + dir.x * .7, y: this.player.position.y + 1.2, z: this.player.position.z + dir.z * .7 }, .8);
    item.velocity.x = dir.x * 3; item.velocity.z = dir.z * 3; item.velocity.y = 2;
    this.audio.play('click');
  }

  private furnaceSlot(slot: 'input' | 'fuel' | 'output', button: number, shift: boolean) {
    if (!this.openFurnaceKey) return;
    const furnace = this.furnaces.get(this.openFurnaceKey); if (!furnace) return;
    if (slot === 'output') {
      if (!furnace.output) return;
      const count = shift ? furnace.output.count : (button === 2 ? 1 : furnace.output.count);
      const accepted = furnace.output.count - this.inventory.add(furnace.output.id, count);
      furnace.output.count -= accepted; if (furnace.output.count <= 0) furnace.output = null;
      if (accepted) this.audio.play('pickup'); else this.ui.toast('Backpack is full.', 'error');
    } else {
      const current = furnace[slot];
      if (current) {
        const accepted = current.count - this.inventory.add(current.id, current.count);
        current.count = accepted; if (!current.count) furnace[slot] = null;
      } else {
        const predicate = slot === 'fuel' ? (s: Stack) => !!ITEM_NAMES[s.id]?.fuel : (s: Stack) => !!SMELTING[s.id];
        const found = this.inventory.slots.findIndex(s => s && predicate(s));
        if (found < 0) { this.ui.toast(slot === 'fuel' ? 'No fuel in backpack (wood, planks, coal).' : 'No smeltable ore or food in backpack.', 'error'); return; }
        const source = this.inventory.slots[found]!;
        const amount = button === 2 ? 1 : source.count;
        source.count -= amount; if (!source.count) this.inventory.slots[found] = null;
        furnace[slot] = { id: source.id, count: amount };
        this.audio.play('click');
      }
    }
    this.ui.updateFurnace(this.furnaceView(), extractStacks(this.inventory));
    this.refreshInventory();
  }
  private furnaceView(): FurnaceView {
    const f = this.openFurnaceKey ? this.furnaces.get(this.openFurnaceKey) : undefined;
    return f ? { input: copyStack(f.input), fuel: copyStack(f.fuel), output: copyStack(f.output), burn: f.burn, burnMax: f.burnMax, progress: f.progress } : { input: null, fuel: null, output: null, burn: 0, burnMax: 0, progress: 0 };
  }

  private attackOrMine(initial: boolean) {
    if (this.attackCooldown > 0) return;
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
    const origin = this.player.eye;
    const mob = this.mobs.nearest(origin, dir, 3.8);
    if (mob && initial) {
      const selected = this.inventory.slots[this.selectedSlot];
      const tool = selected ? ITEM_NAMES[selected.id] : undefined;
      const damage = 1 + (tool?.damage ?? 0) + (this.metadata.mode === 'creative' ? 20 : 0);
      this.mobs.hit(mob, damage, { x: dir.x, y: 0, z: dir.z });
      if (selected && tool?.durability && this.metadata.mode === 'survival') this.inventory.damage(this.selectedSlot, 1);
      this.audio.play('mobHurt'); this.attackCooldown = .55; this.swing = 1;
      return;
    }
    if (initial) this.attackCooldown = .25;
  }

  private currentTarget(): RayHit | null {
    const dir = new THREE.Vector3(); this.camera.getWorldDirection(dir);
    return raycast((x, y, z) => this.world.getBlock(x, y, z), this.player.eye, { x: dir.x, y: dir.y, z: dir.z }, 6);
  }

  private updateMining(dt: number) {
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.swing = Math.max(0, this.swing - dt * 5);
    this.target = this.currentTarget();
    if (this.target) {
      this.highlight.visible = this.isLocked;
      this.highlight.position.set(this.target.x + .5, this.target.y + .5, this.target.z + .5);
    } else { this.highlight.visible = false; this.miningProgress = 0; }
    if (!this.leftHeld || !this.target || this.metadata.mode === 'creative') {
      this.crack.visible = false; this.miningProgress = 0; this.miningKey = '';
      if (this.leftHeld && this.target && this.metadata.mode === 'creative') {
        const timer = performance.now();
        if (timer - this.mineSoundClock > 140) { this.mineSoundClock = timer; this.breakBlock(this.target); }
      }
      return;
    }
    const key = `${this.target.x},${this.target.y},${this.target.z}`;
    if (key !== this.miningKey) { this.miningKey = key; this.miningProgress = 0; }
    const def = blockAt(this.target.id);
    if (def.hardness < 0) return;
    const selected = this.inventory.slots[this.selectedSlot];
    const tool = selected ? ITEM_NAMES[selected.id] : undefined;
    const correct = tool?.tool === def.tool;
    const canTier = (tool?.level ?? 0) >= def.level;
    const speed = correct ? (tool?.speed ?? 1) : 1;
    const base = Math.max(.08, def.hardness * 1.45 / speed * (canTier ? 1 : 1.8));
    this.miningProgress += dt / base;
    this.crack.visible = true;
    this.crack.position.set(this.target.x + .5, this.target.y + .5, this.target.z + .5);
    this.drawCrack(this.miningProgress);
    this.swing = Math.max(this.swing, .65);
    this.mineSoundClock += dt;
    if (this.mineSoundClock > .22) { this.mineSoundClock = 0; this.audio.play('mine'); this.particles.burst(this.target.x, this.target.y, this.target.z, blockParticleColor(this.target.id), 2); }
    if (this.miningProgress >= 1) {
      this.breakBlock(this.target); this.miningProgress = 0; this.miningKey = ''; this.crack.visible = false;
    }
  }

  private drawCrack(progress: number) {
    const ctx = this.crackCanvas.getContext('2d')!; ctx.clearRect(0, 0, 32, 32); ctx.strokeStyle = 'rgba(15,16,14,.85)'; ctx.lineWidth = 1.6;
    const stages = Math.ceil(progress * 8);
    for (let i = 0; i < stages; i++) {
      const angle = i * 2.399; const length = 4 + i * 1.4;
      ctx.beginPath(); ctx.moveTo(16, 16);
      ctx.lineTo(16 + Math.cos(angle) * length, 16 + Math.sin(angle) * length);
      if (i % 2) ctx.lineTo(16 + Math.cos(angle + .6) * length * 1.4, 16 + Math.sin(angle + .6) * length * 1.4);
      ctx.stroke();
    }
    this.crackTexture.needsUpdate = true;
  }

  private breakBlock(hit: RayHit) {
    const def = blockAt(hit.id);
    if (def.hardness < 0) return;
    const selected = this.inventory.slots[this.selectedSlot];
    const tool = selected ? ITEM_NAMES[selected.id] : undefined;
    const canHarvest = !def.level || (tool?.level ?? 0) >= def.level;
    const selectedIsCorrect = tool?.tool === def.tool;
    this.world.setBlock(hit.x, hit.y, hit.z, B.air);
    this.chunkRenderer.markDirty(hit.x, hit.y, hit.z);
    if (this.metadata.mode === 'survival' && selected && tool?.durability) this.inventory.damage(this.selectedSlot, 1);
    this.audio.play('break'); this.particles.burst(hit.x, hit.y, hit.z, blockParticleColor(hit.id), 14);
    let dropId: string | null = def.drop;
    let dropCount = 1;
    if (hit.id === B.oakLeaves || hit.id === B.birchLeaves || hit.id === B.spruceLeaves) { dropId = Math.random() < .12 ? 'apple' : null; }
    if (hit.id === B.tallGrass) dropId = Math.random() < .42 ? 'seeds' : null;
    if (hit.id === B.wheat) { dropId = 'wheat'; dropCount = 1 + Math.floor(Math.random() * 3); }
    if (hit.id === B.gravel && Math.random() < .15) dropId = null;
    if (canHarvest && dropId && (def.level === 0 || selectedIsCorrect)) {
      this.drops.spawn(dropId, dropCount, { x: hit.x + .5, y: hit.y + .4, z: hit.z + .5 }, .2);
    }
    const furnace = this.furnaces.get(`${hit.x},${hit.y},${hit.z}`);
    if (furnace) {
      for (const stack of [furnace.input, furnace.fuel, furnace.output]) if (stack) this.drops.spawn(stack.id, stack.count, { x: hit.x + .5, y: hit.y + .4, z: hit.z + .5 }, .1);
      this.furnaces.delete(`${hit.x},${hit.y},${hit.z}`);
    }
    if (hit.x % CHUNK_SIZE === 0 || (hit.x + 1) % CHUNK_SIZE === 0 || hit.z % CHUNK_SIZE === 0 || (hit.z + 1) % CHUNK_SIZE === 0) {
      this.chunkRenderer.markDirty(hit.x, hit.y, hit.z);
    }
  }

  private useOrPlace() {
    if (this.survival.dead) return;
    const target = this.currentTarget();
    const selected = this.inventory.slots[this.selectedSlot];
    if (target && blockAt(target.id).name === 'craftingTable') { this.openTable(); return; }
    if (target && blockAt(target.id).name === 'furnace') { this.openFurnace(target.x, target.y, target.z); return; }
    if (target && selected?.id === 'seeds' && target.id === B.grass) {
      if (this.world.setBlock(target.x, target.y, target.z, B.farmland) && this.world.setBlock(target.x, target.y + 1, target.z, B.wheat)) {
        this.chunkRenderer.markDirty(target.x, target.y, target.z); this.consumeSelected(); this.audio.play('place');
      }
      return;
    }
    if (selected && itemDef(selected.id).food) {
      if (this.survival.eat(itemDef(selected.id).food!)) {
        this.consumeSelected(); this.audio.play('eat');
        this.ui.toast(`Rested and restored ${itemDef(selected.id).food} hunger`, 'success');
      } else this.ui.toast('You are not hungry.', 'info');
      return;
    }
    if (!selected || !selected.id.startsWith('block:')) return;
    if (!target) return;
    const placeId = blockByName(selected.id.slice(6));
    if (!placeId) return;
    const replaceable = blockAt(target.id).replaceable;
    const x = target.x + (replaceable ? 0 : target.nx), y = target.y + (replaceable ? 0 : target.ny), z = target.z + (replaceable ? 0 : target.nz);
    if (y <= 0 || y >= WORLD_HEIGHT) return;
    const body = this.player.position;
    const def = blockAt(placeId);
    if (def.solid && x + 1 > body.x - .3 && x < body.x + .3 && y + 1 > body.y && y < body.y + 1.79 && z + 1 > body.z - .3 && z < body.z + .3) {
      this.ui.toast('That would trap you.', 'error'); return;
    }
    if (!this.world.setBlock(x, y, z, placeId)) return;
    this.chunkRenderer.markDirty(x, y, z);
    this.consumeSelected(); this.audio.play('place');
    this.particles.burst(x, y, z, blockParticleColor(placeId), 4);
    this.swing = 1;
  }
  private consumeSelected() {
    if (this.metadata.mode === 'creative') return;
    const stack = this.inventory.slots[this.selectedSlot]; if (!stack) return;
    stack.count--; if (!stack.count) this.inventory.slots[this.selectedSlot] = null;
  }

  private createHand() {
    this.hand.clear();
    const selected = this.inventory.slots[this.selectedSlot];
    if (!selected) { this.handId = ''; return; }
    const texture = new THREE.TextureLoader().load(itemIcon(selected.id));
    texture.magFilter = THREE.NearestFilter; texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshLambertMaterial({ map: texture, transparent: true, alphaTest: .1 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(.22, .22, .22), material);
    mesh.rotation.set(.1, .65, .12); this.hand.add(mesh);
    this.handId = selected.id;
  }
  private updateHand() {
    const selected = this.inventory.slots[this.selectedSlot];
    const id = selected?.id ?? '';
    if (id !== this.handId) this.createHand();
    this.hand.visible = !!selected;
  }

  private toggleDebug() {
    this.debugOn = !this.debugOn;
    if (!this.debugOn) this.ui.setDebug(null);
  }
  private debugOn = false;

  private handleSurvivalDamage(result: { damage: number; cause: string } | null) {
    if (!result) return;
    this.audio.play('hurt'); this.ui.flashDamage();
    this.ui.toast(`Took ${result.damage} damage (${result.cause}).`, 'error');
  }

  private updateInventoryAndHud() {
    this.updateHand();
    const view: HudView = {
      health: this.survival.health, hunger: this.survival.hunger, oxygen: this.survival.oxygen,
      mode: this.metadata.mode, selected: this.selectedSlot, slots: extractStacks(this.inventory),
      biome: BIOMES[this.world.biomeAt(Math.floor(this.player.position.x), Math.floor(this.player.position.z))] ?? 'plains',
      clock: formatClock(this.worldTime), underwater: this.player.inWater && this.camera.position.y < 27.2, seed: this.metadata.seed,
    };
    this.ui.renderHud(view);
    if (this.openFurnaceKey && performance.now() - this.lastUiFurnace > 240) {
      this.lastUiFurnace = performance.now();
      this.ui.updateFurnace(this.furnaceView(), extractStacks(this.inventory));
    }
  }

  private tickFurnaces(dt: number) {
    for (const furnace of this.furnaces.values()) furnaceTick(furnace, dt);
  }

  private tick(dt: number) {
    if (this.survival.dead) return;
    this.worldTime += dt; this.autoSaveClock += dt;
    this.physicsTime += dt;
    const forward = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const strafe = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const input = emptyInput();
    input.forward = forward; input.strafe = strafe;
    input.jump = this.keys.has('Space'); input.sneak = this.keys.has('ShiftLeft');
    input.sprint = this.keys.has('ControlLeft'); input.up = this.keys.has('Space'); input.down = this.keys.has('ShiftLeft');
    this.player.flying = this.metadata.mode === 'creative' && this.flyEnabled;
    const wasInWater = this.player.inWater;
    const result = this.player.step(this.world, input, dt, this.metadata.mode === 'creative');
    if (result.inWater && !wasInWater) this.audio.play('splash');
    if (result.landed > 0) {
      this.handleSurvivalDamage(this.survival.applyDamage(Math.floor(result.landed), 'fall'));
      this.audio.play('land');
    }
    if (input.jump && this.player.onGround) this.audio.play('jump');
    const moving = Math.abs(this.player.velocity.x) + Math.abs(this.player.velocity.z) > .7;
    if (this.player.onGround && moving) {
      this.stepDistance += Math.hypot(this.player.velocity.x, this.player.velocity.z) * dt;
      if (this.stepDistance > 1.8) { this.stepDistance = 0; this.audio.play('step'); }
    }
    const survivalResult = this.survival.tick(dt, this.player.inWater, moving);
    this.handleSurvivalDamage(survivalResult);
    this.tickFurnaces(dt);
    this.mobs.update(this.world, dt, this.player.position, this.sky.isNight, damage => {
      const hit = this.survival.applyDamage(damage, 'mob');
      this.handleSurvivalDamage(hit);
    }, (kind, position) => this.mobDrops(kind, position));
    this.drops.update(this.world, dt, this.player.position, (id, count) => this.inventory.add(id, count), (id, count) => {
      this.audio.play('pickup'); this.ui.toast(`+${count} ${itemDef(id).label ?? id}`, 'success');
    });
    if (this.survival.dead) this.handleDeath();
    if (this.autoSaveClock > 30) {
      this.autoSaveClock = 0;
      if (!this.saving) void this.save().catch(error => this.saveError(error));
    }
    this.updateInventoryAndHud();
  }

  private mobDrops(kind: MobKind, position: { x: number; y: number; z: number }) {
    const drop = kind === 'pig' ? 'rawPork' : kind === 'sheep' ? 'wheat' : 'rottenFlesh';
    this.drops.spawn(drop, 1 + (Math.random() < .35 ? 1 : 0), { x: position.x, y: position.y + .4, z: position.z }, .3);
    this.audio.play('mobDeath');
  }

  private handleDeath() {
    if (this.deadHandled) return; this.deadHandled = true;
    for (let i = 0; i < this.inventory.slots.length; i++) {
      const stack = this.inventory.slots[i]; if (!stack) continue;
      this.drops.spawn(stack.id, stack.count, { x: this.player.position.x, y: this.player.position.y + .3, z: this.player.position.z }, 4);
      this.inventory.slots[i] = null;
    }
    this.returnCraftGrid();
    if (this.isLocked) document.exitPointerLock();
    this.ui.showDeath(); this.ui.toast('You died. Your items fell where you stood.', 'error');
    void this.save().catch(error => this.saveError(error));
  }

  private respawn() {
    if (!this.survival.dead) return;
    const spawn = findSpawn(hashString(this.metadata.seed));
    this.player.position.x = spawn.x; this.player.position.y = spawn.y; this.player.position.z = spawn.z;
    this.player.velocity.x = 0; this.player.velocity.y = 0; this.player.velocity.z = 0;
    this.survival.respawn(); this.deadHandled = false;
    this.ui.hideDeath(); this.ui.showGame(); this.lockPointer();
  }

  private update(dt: number) {
    if (!this.ready) {
      const progress = clamp(this.chunkRenderer.getVisibleCount() / 25, 0, .95);
      if (performance.now() - this.lastProgress > 120) {
        this.lastProgress = performance.now();
        this.options.onProgress?.(progress);
        this.ui.updateLoading(progress, `Building terrain · ${this.chunkRenderer.getVisibleCount()} chunks ready`);
      }
    }
    this.chunkRenderer.update(this.player.position.x, this.player.position.z, performance.now());
    this.updateMining(dt);
    const bobAmount = this.player.onGround && this.isLocked ? Math.min(.035, Math.hypot(this.player.velocity.x, this.player.velocity.z) * .005) : 0;
    const bob = Math.sin(this.physicsTime * 10) * bobAmount;
    this.camera.position.set(this.player.position.x, this.player.position.y + (this.player.inWater ? 1.52 : 1.62) + bob, this.player.position.z);
    this.camera.rotation.set(this.player.pitch, this.player.yaw, 0);
    const fov = (this.keys.has('ControlLeft') && this.player.onGround ? 82 : 74);
    if (Math.abs(this.camera.fov - fov) > .2) { this.camera.fov += (fov - this.camera.fov) * dt * 8; this.camera.updateProjectionMatrix(); }
    this.sky.update(this.worldTime / DAY_SECONDS, this.camera.position, performance.now() / 1000);
    this.particles.update(dt);
    this.mobRenderer.sync(this.mobs.mobs, dt);
    this.dropRenderer.sync(this.drops.items, performance.now() / 1000);
    this.hand.position.set(.32 + Math.sin(this.physicsTime * 5) * bobAmount * .4, -.28 - bob * .6, -.57);
    this.hand.rotation.set(-.08 - this.swing * .5, -.18, -.05);
    this.camera.updateMatrixWorld();
    if (this.debugOn && this.lastHudUpdate === 0) this.ui.setDebug('');
    if (this.debugOn) this.renderDebug();
    this.lastHudUpdate++;
    this.updateInventoryAndHud();
  }

  private renderDebug() {
    const stats = this.chunkRenderer.stats;
    this.ui.setDebug(`<div class="debug-title">VOXELCRAFT <span>K3.1</span></div>
      <div><b>FPS</b> ${Math.round(1000 / this.frameAvg)} <b>frame</b> ${this.frameAvg.toFixed(1)}ms</div>
      <div><b>XYZ</b> ${this.player.position.x.toFixed(1)} / ${this.player.position.y.toFixed(1)} / ${this.player.position.z.toFixed(1)}</div>
      <div><b>Chunk</b> ${Math.floor(this.player.position.x / CHUNK_SIZE)}, ${Math.floor(this.player.position.z / CHUNK_SIZE)} · <b>Biome</b> ${BIOMES[this.world.biomeAt(Math.floor(this.player.position.x), Math.floor(this.player.position.z))]}</div>
      <div><b>Chunks</b> ${stats.loaded} loaded · ${stats.visible} visible · ${stats.queued} queued</div>
      <div><b>Tasks</b> ${stats.generating} gen · ${stats.meshing} mesh · <b>gen</b> ${stats.genMs.toFixed(1)}ms · <b>mesh</b> ${stats.meshMs.toFixed(1)}ms</div>
      <div><b>Draw calls</b> ${this.renderer.info.render.calls + stats.drawCalls} · <b>Triangles</b> ${Math.floor(stats.triangles + this.renderer.info.render.triangles)}</div>
      <div><b>Entities</b> ${this.mobs.mobs.length} · <b>Drops</b> ${this.drops.items.length} · <b>Time</b> ${formatClock(this.worldTime)}</div>
      <div><b>Seed</b> ${this.metadata.seed} · <b>Mode</b> ${this.metadata.mode}</div>`);
  }

  private resize() {
    const width = this.host.clientWidth || window.innerWidth, height = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height); this.camera.updateProjectionMatrix();
  }

  private loop(now: number) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const raw = (now - this.lastFrame) / 1000; this.lastFrame = now;
    const dt = Math.min(.1, Math.max(0, raw));
    this.frameAvg += ((raw * 1000) - this.frameAvg) * .08;
    const active = this.ready && !this.ui.simulationPaused && !this.survival.dead;
    if (active) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= 1 / 60 && steps++ < 8) { this.accumulator -= 1 / 60; this.tick(1 / 60); }
    }
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private saveError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    this.options.onSaveError(message); this.ui.toast(`Save failed: ${message}`, 'error'); this.ui.hideSaving();
  }

  save(): Promise<void> {
    if (this.saving) return this.saving;
    const player: PlayerSave = {
      position: { ...this.player.position }, yaw: this.player.yaw, pitch: this.player.pitch,
      health: this.survival.health, hunger: this.survival.hunger, oxygen: this.survival.oxygen,
      time: this.worldTime, inventory: extractStacks(this.inventory), selected: this.selectedSlot,
    };
    const save: WorldSave = {
      schema: 2, generator: 1, metadata: { ...this.metadata, updatedAt: Date.now() }, player,
      edits: this.world.snapshotEdits(), furnaces: Object.fromEntries(this.furnaces) as Record<string, FurnaceState>,
      drops: this.drops.snapshot(),
    };
    this.metadata.updatedAt = save.metadata.updatedAt;
    this.ui.showSaving('Saving world…');
    this.saving = this.storage.save(save).then(() => {
      this.ui.hideSaving(); this.saving = null; this.options.onWorldUpdated();
    }).catch(error => { this.saving = null; this.saveError(error); throw error; });
    return this.saving;
  }

  getStats() { return { ...this.chunkRenderer.stats, fps: 1000 / this.frameAvg, mobs: this.mobs.mobs.length, drops: this.drops.items.length, position: { ...this.player.position } }; }
  get debugEnabled() { return this.debugOn; }
  setDebugEnabled(value: boolean) { this.debugOn = value; if (!value) this.ui.setDebug(null); }
  get isDead() { return this.survival.dead; }
  get gameMode() { return this.metadata.mode; }
  get renderingStats() { return { ...this.renderer.info.render }; }

  dispose(): void {
    if (this.disposed) return; this.disposed = true; this.running = false;
    cancelAnimationFrame(this.raf);
    this.listeners.forEach(fn => fn()); this.listeners = [];
    this.resizeObserver.disconnect();
    if (this.isLocked) document.exitPointerLock();
    this.mobRenderer.dispose(); this.dropRenderer.dispose(); this.particles.dispose();
    this.chunkRenderer.dispose(); this.sky.dispose();
    this.crack.geometry.dispose(); (this.crack.material as THREE.Material).dispose(); this.crackTexture.dispose();
    this.highlight.geometry.dispose(); (this.highlight.material as THREE.Material).dispose();
    this.hand.traverse(obj => { if (obj instanceof THREE.Mesh) { obj.geometry.dispose(); const material = obj.material as THREE.MeshLambertMaterial; material.map?.dispose(); material.dispose(); } });
    this.renderer.dispose(); this.renderer.domElement.remove();
    this.scene.clear();
  }
}
