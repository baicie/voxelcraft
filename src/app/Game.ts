import * as THREE from 'three';
import { AudioManager } from '../engine/AudioManager';
import { GameCamera } from '../engine/GameCamera';
import { Input } from '../engine/Input';
import { Renderer } from '../engine/Renderer';
import type { GameSettings } from '../persistence/SettingsStore';
import type {
  PlayerSaveV2,
  SaveBundle,
  SaveMeta,
  WorldRecord,
} from '../persistence/WorldStorage';
import { DEFAULT_PLAYER_STATS, WorldStorage, type PlayerSnapshot } from '../persistence/WorldStorage';
import type { FurnaceSave } from '../furnace/FurnaceStore';
import { BlockInteraction, type InteractionHost } from '../player/BlockInteraction';
import { Player } from '../player/Player';
import { PlayerController } from '../player/PlayerController';
import { buildChunkMesh } from '../rendering/ChunkMesher';
import { ChunkRenderer } from '../rendering/ChunkRenderer';
import { createChunkMaterials, type ChunkMaterialSet } from '../rendering/Materials';
import { ParticleSystem } from '../rendering/ParticleSystem';
import { SkySystem } from '../rendering/SkySystem';
import { TextureAtlas } from '../rendering/TextureAtlas';
import {
  BLOCK_DEFS,
  BlockId,
  HOTBAR_BLOCKS,
  getBlockDefinition,
  type BlockDefinition,
} from '../world/BlockRegistry';
import {
  CHUNK_HEIGHT,
  CHUNK_SIZE,
  DAY_LENGTH_SECONDS,
  SEA_LEVEL,
  worldToChunk,
} from '../world/constants';
import { World } from '../world/World';
import { GameLoop } from './GameLoop';
import type { GameCallbacks, GameStats, HotbarState } from './GameEvents';
import { createItemStack, cloneStack, decrementDurability, type ItemStack } from '../items/ItemStack';
import {
  getBlockItemId,
  getItemDefinition,
  getPlaceBlockId,
} from '../items/ItemRegistry';
import { inventoryService } from '../inventory/InventoryService';
import { ContainerSession, type ContainerKind, type ContainerView } from '../inventory/ContainerSession';
import { getBlockDrops } from '../mining/LootTable';
import { SurvivalState } from '../survival/SurvivalState';
import { ItemEntityRenderer } from '../entities/ItemEntityRenderer';
import type { ItemEntitySave } from '../entities/ItemEntity';

export interface GameOptions {
  canvas: HTMLCanvasElement;
  meta: WorldRecord;
  playerSave: PlayerSaveV2 | null;
  edits: Map<string, Map<number, BlockId>>;
  furnaces?: FurnaceSave[];
  itemEntities?: ItemEntitySave[];
  saveMeta?: SaveMeta | null;
  settings: GameSettings;
  storage: WorldStorage;
  callbacks: GameCallbacks;
}

export type LoadingProgressCallback = (progress: number, label: string) => void;

const DEFAULT_HOTBAR = [...HOTBAR_BLOCKS];
const MAX_AUTOSAVE_SECONDS = 15;
const FIXED_STEP_SECONDS = 1 / 60;
const MAX_FIXED_STEPS = 5;

export class Game {
  readonly meta: WorldRecord;
  readonly atlas: TextureAtlas;
  readonly renderer: Renderer;
  readonly world: World;
  readonly player: Player;
  readonly camera: GameCamera;
  readonly controller: PlayerController;
  readonly input: Input;
  readonly interaction: BlockInteraction;
  readonly sky: SkySystem;
  readonly chunkRenderer: ChunkRenderer;
  readonly particles: ParticleSystem;
  readonly audio: AudioManager;
  readonly itemEntityRenderer: ItemEntityRenderer;
  readonly survival: SurvivalState | null;

  private readonly options: GameOptions;
  private readonly loop: GameLoop;
  private readonly materials: ChunkMaterialSet;
  private settings: GameSettings;
  private readonly creativeHotbar: BlockId[];
  private selectedSlot: number;
  private paused = true;
  private disposed = false;
  private prepared = false;
  private statsTimer = 0;
  private fps = 60;
  private frameMs = 16.7;
  private saveCountdown = MAX_AUTOSAVE_SECONDS;
  private autosaveTimer = MAX_AUTOSAVE_SECONDS;
  private saveChain: Promise<void> = Promise.resolve();
  private lastMeshBuildMs = 0;
  private lastGenerationErrorAt = 0;
  private breakSequence = 0;
  private saveSequence = 0;
  private container: ContainerSession | null = null;
  private containerRefreshTimer = 0;
  private simulationAccumulator = 0;
  private droppedSimulationMs = 0;

  constructor(options: GameOptions) {
    this.options = options;
    this.meta = {
      ...options.meta,
      player: options.meta.player ? { ...options.meta.player } : null,
    };
    this.settings = { ...options.settings };
    this.saveSequence = options.saveMeta?.sequence ?? 0;
    this.creativeHotbar = sanitizeHotbar(options.meta.hotbar);
    this.survival =
      options.meta.mode === 'survival'
        ? SurvivalState.fromSave(options.playerSave, options.itemEntities ?? [], options.furnaces ?? [])
        : null;
    this.selectedSlot = this.survival?.selectedSlot ?? clampSlot(options.playerSave?.selectedHotbarSlot ?? options.meta.selectedSlot);

    this.renderer = new Renderer(options.canvas);
    this.atlas = new TextureAtlas();
    this.materials = createChunkMaterials(this.atlas);
    this.sky = new SkySystem(this.renderer.scene);
    this.particles = new ParticleSystem(this.renderer.scene);
    this.itemEntityRenderer = new ItemEntityRenderer(this.renderer.scene);
    this.audio = new AudioManager();
    this.audio.setVolume(this.settings.volume);

    this.world = new World({
      id: options.meta.id,
      seed: options.meta.seed,
      generatorVersion: options.meta.generatorVersion,
      renderDistance: this.settings.renderDistance,
      edits: options.edits,
      onGenerationError: (error) => this.handleGenerationError(error),
    });
    this.world.setRenderDistance(this.settings.renderDistance);
    this.chunkRenderer = new ChunkRenderer(this.renderer.scene, this.materials);
    this.world.onChunkUnloaded = (chunk) => this.chunkRenderer.removeChunk(chunk.cx, chunk.cz);

    const v2Position = options.playerSave?.position;
    const savedPlayer = v2Position
      ? { x: v2Position[0], y: v2Position[1], z: v2Position[2] }
      : options.meta.player;
    const spawn = savedPlayer
      ? { x: savedPlayer.x, y: savedPlayer.y, z: savedPlayer.z }
      : this.world.generator.findSpawnPoint(CHUNK_SIZE / 2, CHUNK_SIZE / 2);
    this.player = new Player(new THREE.Vector3(spawn.x, spawn.y, spawn.z));
    const savedYaw = options.playerSave?.yaw ?? options.meta.player?.yaw;
    const savedPitch = options.playerSave?.pitch ?? options.meta.player?.pitch;
    this.player.yaw = savedYaw ?? this.chooseSpawnYaw(spawn.x, spawn.z);
    this.player.pitch = savedPitch ?? -0.08;
    const savedVelocity = options.playerSave?.velocity;
    if (savedVelocity) this.player.velocity.set(savedVelocity[0], savedVelocity[1], savedVelocity[2]);

    this.camera = new GameCamera(window.innerWidth / Math.max(1, window.innerHeight));
    this.camera.setViewDistance(this.settings.renderDistance);
    this.camera.setFov(this.settings.fov);
    this.input = new Input(options.canvas);
    this.controller = new PlayerController(this.player, this.camera, this.input);
    this.controller.setSensitivity(this.settings.sensitivity);
    this.controller.setFov(this.settings.fov);
    this.controller.setFlightAllowed(options.meta.mode === 'creative' || options.meta.cheatsEnabled);
    this.controller.onFootstep = () => this.audio.playStep(this.player.inWater);
    this.controller.onFlyToggle = (flying) => {
      this.options.callbacks.onMessage(flying ? '飞行模式：开启 (F 关闭)' : '飞行模式：关闭');
    };
    this.interaction = new BlockInteraction(
      this.renderer.scene,
      this.camera.camera,
      this.player,
      this.world,
      this.input,
    );
    this.interaction.host = this.createInteractionHost();

    this.input.onPointerLockChanged = (locked) => {
      if (!this.disposed) this.options.callbacks.onPointerLockChanged(locked);
    };

    this.sky.setTimeOfDay(options.meta.timeOfDay ?? 0.31);
    this.sky.setRenderDistance(this.settings.renderDistance);
    this.loop = new GameLoop((dt) => this.frame(dt));

    this.controller.update(0.016, this.world, false);
    this.sky.update(this.camera.camera);
  }

  async prepare(onProgress: LoadingProgressCallback = () => {}): Promise<void> {
    if (this.prepared) return;
    const targetRadius = Math.min(3, this.settings.renderDistance);
    const targetCount = (targetRadius * 2 + 1) ** 2;
    const startedAt = performance.now();

    await new Promise<void>((resolve) => {
      let resolved = false;
      const finish = (): void => {
        if (resolved) return;
        resolved = true;
        this.settlePlayerPosition();
        this.controller.update(0.016, this.world, false);
        this.prepared = true;
        onProgress(1, '准备完成');
        resolve();
      };

      const tick = (): void => {
        if (this.disposed) {
          resolved = true;
          resolve();
          return;
        }
        this.world.update(this.player.position.x, this.player.position.z);
        this.pumpMeshes(9);
        this.controller.update(0.016, this.world, false);
        this.sky.update(this.camera.camera);
        this.renderer.render(this.camera.camera);

        const loadedNearby = this.world.countLoadedWithin(this.player.position.x, this.player.position.z, targetRadius + 1);
        const expectedNearby = (targetRadius * 2 + 3) ** 2;
        const meshedNearby = this.chunkRenderer.countMeshedWithin(
          this.player.position.x,
          this.player.position.z,
          targetRadius,
        );
        const progress = Math.min(
          0.98,
          (meshedNearby / targetCount) * 0.86 + Math.min(1, loadedNearby / expectedNearby) * 0.14,
        );
        onProgress(progress, meshedNearby < targetCount ? '正在雕刻地形' : '正在生成网格');
        if (meshedNearby >= targetCount) {
          finish();
          return;
        }
        if (performance.now() - startedAt > 25_000) {
          this.options.callbacks.onMessage('世界加载较慢，已提前进入；其余区块会继续载入');
          finish();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    this.emitStats();
  }

  start(): void {
    if (this.disposed) return;
    this.loop.start();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.simulationAccumulator = 0;
      this.input.clearTransient();
      this.interaction.update(0, false);
      this.options.callbacks.onMiningProgress(0);
    }
    this.options.canvas.classList.toggle('is-playing', !paused);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isContainerOpen(): boolean {
    return this.container !== null;
  }

  get isCreative(): boolean {
    return this.survival === null;
  }

  get isPointerLocked(): boolean {
    return this.input.isLocked;
  }

  async requestPointerLock(): Promise<void> {
    this.audio.unlock();
    await this.input.requestPointerLock();
  }

  exitPointerLock(): void {
    this.input.exitPointerLock();
  }

  resize(): void {
    this.renderer.resize();
    this.camera.setAspect(window.innerWidth / Math.max(1, window.innerHeight));
  }

  applySettings(settings: GameSettings): void {
    this.settings = { ...settings };
    this.world.setRenderDistance(settings.renderDistance);
    this.camera.setViewDistance(settings.renderDistance);
    this.sky.setRenderDistance(settings.renderDistance);
    this.controller.setSensitivity(settings.sensitivity);
    this.controller.setFov(settings.fov);
    this.audio.setVolume(settings.volume);
    this.meta.renderDistance = settings.renderDistance;
  }

  getHotbarState(): HotbarState {
    if (this.survival) {
      return {
        mode: 'survival',
        slots: Array.from({ length: 9 }, (_, index) => cloneStack(this.survival!.inventory.get(index))),
        selectedIndex: this.selectedSlot,
      };
    }
    return {
      mode: 'creative',
      slots: this.creativeHotbar.map((block) => {
        const itemId = getBlockItemId(block);
        return itemId ? createItemStack(itemId, 1) : null;
      }),
      selectedIndex: this.selectedSlot,
    };
  }

  getHeldStack(): ItemStack | null {
    return this.survival?.inventory.get(this.selectedSlot) ?? null;
  }

  getStats(): GameStats {
    const stats = this.world.getStats();
    const chunkX = worldToChunk(this.player.position.x);
    const chunkZ = worldToChunk(this.player.position.z);
    const target = this.interaction.getTarget();
    const targetLabel = target
      ? `${getBlockDefinition(target.block).name} @ ${target.x},${target.y},${target.z}`
      : '—';
    const held = this.getHeldStack();
    const heldDefinition = held ? getItemDefinition(held.itemId) : undefined;
    return {
      fps: this.fps,
      frameMs: this.frameMs,
      x: this.player.position.x,
      y: this.player.position.y,
      z: this.player.position.z,
      chunkX,
      chunkZ,
      loadedChunks: stats.loaded,
      pendingChunks: stats.pending,
      dirtyMeshes: stats.dirtyMeshes,
      meshedChunks: this.chunkRenderer.meshCount,
      drawCalls: this.renderer.drawCalls,
      triangles: this.renderer.triangles,
      faces: this.chunkRenderer.totalFaces,
      meshBuildMs: this.lastMeshBuildMs,
      timeOfDay: this.sky.currentTime,
      flying: this.player.flying,
      inWater: this.player.inWater,
      selectedSlot: this.selectedSlot,
      renderDistance: this.settings.renderDistance,
      target: targetLabel,
      mode: this.survival ? 'survival' : 'creative',
      selectedItem: heldDefinition?.name ?? (this.survival ? '空手' : getBlockDefinition(this.currentCreativeBlock).name),
      selectedCount: held?.count ?? 0,
      itemEntities: this.survival?.items.size ?? 0,
      simulationDroppedMs: this.droppedSimulationMs,
    };
  }

  openContainer(kind: ContainerKind, furnacePos?: { x: number; y: number; z: number }): ContainerView | null {
    if (!this.survival) {
      this.options.callbacks.onMessage('创造模式暂不使用生存背包');
      return null;
    }
    if (this.container) this.closeContainer();
    this.container = new ContainerSession({
      kind,
      inventory: this.survival.inventory,
      furnaces: this.survival.furnaces,
      furnacePos,
      selectedSlot: this.selectedSlot,
    });
    this.interaction.update(0, false);
    this.options.callbacks.onMiningProgress(0);
    this.input.clearTransient();
    return this.container.view();
  }

  getContainerView(): ContainerView | null {
    return this.container?.view() ?? null;
  }

  containerClickInventory(slot: number, button: 0 | 2, shift: boolean): ContainerView | null {
    this.container?.clickInventory(slot, button, shift);
    return this.container?.view() ?? null;
  }

  containerClickCraftGrid(slot: number, button: 0 | 2, shift: boolean): ContainerView | null {
    this.container?.clickCraftGrid(slot, button, shift);
    return this.container?.view() ?? null;
  }

  containerTakeCraftOutput(shift: boolean): ContainerView | null {
    const crafted = this.container?.takeCraftOutput(shift) ?? 0;
    if (crafted === 0) this.options.callbacks.onMessage('材料不足或背包已满');
    this.emitHotbar();
    return this.container?.view() ?? null;
  }

  containerClickFurnaceSlot(slot: 'input' | 'fuel' | 'output', button: 0 | 2, shift: boolean): ContainerView | null {
    this.container?.clickFurnaceSlot(slot, button, shift);
    this.emitHotbar();
    return this.container?.view() ?? null;
  }

  closeContainer(): ContainerView | null {
    if (!this.container) return null;
    const leftovers = this.container.close();
    for (const stack of leftovers) {
      this.survival?.spawnSingleDrop(stack, this.player.position.x, this.player.position.y + 0.6, this.player.position.z, this.world.generator.seed);
    }
    this.container = null;
    this.options.callbacks.onContainerClosed();
    this.emitHotbar();
    this.scheduleSaveSoon();
    return null;
  }

  saveNow(notify = false): Promise<void> {
    const result = this.saveChain.then(() => this.performSave(notify));
    this.saveChain = result.catch(() => undefined);
    return result;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop.stop();
    this.container = null;
    this.input.dispose();
    this.interaction.dispose();
    this.world.onChunkUnloaded = null;
    this.world.dispose();
    this.chunkRenderer.dispose();
    this.itemEntityRenderer.dispose();
    this.materials.dispose();
    this.atlas.dispose();
    this.sky.dispose();
    this.particles.dispose();
    this.renderer.dispose();
    this.audio.dispose();
  }

  private get currentCreativeBlock(): BlockId {
    return this.creativeHotbar[this.selectedSlot] ?? BlockId.Grass;
  }

  private createInteractionHost(): InteractionHost {
    return {
      creative: !this.survival,
      getHeldStack: () => this.getHeldStack(),
      placeBlock: (x, y, z) => this.placeBlockAt(x, y, z),
      breakBlock: (x, y, z, block) => this.breakBlockAt(x, y, z, block),
      useBlock: (x, y, z, block) => this.useBlockAt(x, y, z, block),
      onMiningProgress: (progress) => this.options.callbacks.onMiningProgress(progress),
      onMessage: (message) => this.options.callbacks.onMessage(message),
    };
  }

  private chooseSpawnYaw(x: number, z: number): number {
    const base = this.world.getSurfaceHeight(x, z);
    let bestYaw = Math.PI * 0.15;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let index = 0; index < 16; index++) {
      const angle = (index / 16) * Math.PI * 2;
      const dirX = Math.sin(angle);
      const dirZ = Math.cos(angle);
      let score = 0;
      let waterSeen = false;
      for (const distance of [6, 12, 20, 30, 42]) {
        const height = this.world.generator.getSurfaceHeight(
          Math.floor(x + dirX * distance),
          Math.floor(z + dirZ * distance),
        );
        const obstruction = Math.max(0, height - base);
        score += (obstruction * obstruction) / distance;
        if (height < SEA_LEVEL) waterSeen = true;
      }
      if (waterSeen) score -= 6;
      if (score < bestScore) {
        bestScore = score;
        bestYaw = Math.atan2(-dirX, -dirZ);
      }
    }
    return bestYaw;
  }

  private frame(dt: number): void {
    if (this.disposed) return;
    this.fps += (1 / Math.max(dt, 0.0001) - this.fps) * 0.08;
    this.frameMs += (dt * 1000 - this.frameMs) * 0.08;

    if (!this.paused) {
      if (this.container === null) this.handleHotbarInput();
      const maxAccumulated = MAX_FIXED_STEPS * FIXED_STEP_SECONDS;
      const accumulated = this.simulationAccumulator + dt;
      if (accumulated > maxAccumulated) this.droppedSimulationMs += (accumulated - maxAccumulated) * 1000;
      this.simulationAccumulator = Math.min(accumulated, maxAccumulated);
      let steps = 0;
      while (this.simulationAccumulator >= FIXED_STEP_SECONDS && steps < MAX_FIXED_STEPS) {
        this.simulateFixed(FIXED_STEP_SECONDS, this.container === null);
        this.simulationAccumulator -= FIXED_STEP_SECONDS;
        steps++;
      }
      if (this.simulationAccumulator >= FIXED_STEP_SECONDS) this.simulationAccumulator = 0;

      this.world.update(this.player.position.x, this.player.position.z);
      this.pumpMeshes(5.5);
      this.particles.update(dt);
      if (this.container) {
        this.containerRefreshTimer += dt;
        if (this.containerRefreshTimer >= 0.2) {
          this.containerRefreshTimer = 0;
          this.options.callbacks.onContainerChanged(this.container.view());
        }
      }
      this.tickSaving(dt);
    }

    if (this.survival) this.itemEntityRenderer.update(this.survival.items);
    this.sky.update(this.camera.camera);
    this.renderer.render(this.camera.camera);

    this.statsTimer += dt;
    if (this.statsTimer >= 0.25) {
      this.statsTimer = 0;
      this.emitStats();
    }
    this.input.endFrame();
  }

  private simulateFixed(step: number, controlsActive: boolean): void {
    this.sky.advance(step, DAY_LENGTH_SECONDS);
    if (controlsActive) {
      this.controller.update(step, this.world, true);
      this.interaction.update(step, true);
    } else {
      this.controller.update(step, this.world, false);
    }
    if (this.survival) {
      this.survival.furnaces.tick(1);
      this.survival.update(step, this.world, this.player.position);
    }
    this.checkVoidRespawn();
  }

  private handleHotbarInput(): void {
    for (let index = 0; index < 9; index++) {
      if (this.input.wasPressed(`Digit${index + 1}`)) {
        this.setSelectedSlot(index);
        break;
      }
    }
    const wheel = this.input.consumeWheel();
    if (wheel !== 0) {
      this.setSelectedSlot((this.selectedSlot + (wheel > 0 ? 1 : -1) + 9) % 9);
    }
    if (this.survival && this.input.wasPressed('KeyE')) {
      this.options.callbacks.onContainerRequested('inventory');
    }
  }

  private setSelectedSlot(index: number): void {
    const next = clampSlot(index);
    if (next === this.selectedSlot) return;
    this.selectedSlot = next;
    if (this.survival) this.survival.selectedSlot = next;
    this.emitHotbar();
    this.audio.playUIClick();
  }

  private emitHotbar(): void {
    this.options.callbacks.onHotbar(this.getHotbarState());
  }

  private buildPlayerSave(): PlayerSaveV2 {
    const inventory = this.survival
      ? this.survival.inventory.snapshot().slots
      : Array.from({ length: 36 }, () => null);
    return {
      schemaVersion: 2,
      worldId: this.meta.id,
      position: [this.player.position.x, this.player.position.y, this.player.position.z],
      velocity: [this.player.velocity.x, this.player.velocity.y, this.player.velocity.z],
      yaw: this.player.yaw,
      pitch: this.player.pitch,
      inventory,
      selectedHotbarSlot: this.selectedSlot,
      stats: { ...DEFAULT_PLAYER_STATS },
    };
  }

  private pumpMeshes(budgetMs: number): void {
    const deadline = performance.now() + budgetMs;
    let built = 0;
    do {
      const chunk = this.world.takeMeshJob(this.player.position.x, this.player.position.z);
      if (!chunk) break;
      const started = performance.now();
      const mesh = buildChunkMesh(chunk, this.world, this.atlas);
      this.chunkRenderer.setChunkMesh(chunk, mesh);
      this.lastMeshBuildMs = performance.now() - started;
      built++;
      if (built > 32) break;
    } while (performance.now() < deadline);
  }

  private handleBlockPlace(x: number, y: number, z: number, block: BlockId): void {
    const definition = getBlockDefinition(block);
    this.particles.spawnBlockBurst(x + 0.5, y + 0.5, z + 0.5, definition.particleColor, 7, 0.55);
    this.audio.playPlace();
    this.scheduleSaveSoon();
  }

  private breakBlockAt(x: number, y: number, z: number, block: BlockId): boolean {
    const definition = getBlockDefinition(block);
    if (!definition.breakable) return false;
    if (this.survival) {
      const held = this.getHeldStack();
      const drops = getBlockDrops(block, held, {
        x,
        y,
        z,
        sequence: this.breakSequence++,
        seed: this.world.generator.seed,
      });
      if (block === BlockId.Furnace) {
        const state = this.survival.furnaces.remove(x, y, z);
        if (state) {
          for (const stack of [state.input, state.fuel, state.output]) {
            if (stack) drops.push({ ...stack });
          }
        }
      }
      if (!this.world.setBlock(x, y, z, BlockId.Air)) return false;
      this.survival.spawnDrops(drops, x + 0.5, y + 0.5, z + 0.5, this.world.generator.seed);
      if (held && getItemDefinition(held.itemId)?.maxDurability !== undefined) {
        const result = decrementDurability(held);
        this.setInventorySlot(this.selectedSlot, result.stack);
        if (result.broke) this.options.callbacks.onMessage('工具已损坏');
      }
      this.emitHotbar();
    } else {
      if (!this.world.setBlock(x, y, z, BlockId.Air)) return false;
    }

    this.handleBlockBreakEffects(x, y, z, definition);
    return true;
  }

  private placeBlockAt(x: number, y: number, z: number): boolean {
    if (y < 0 || y >= CHUNK_HEIGHT) return false;
    const existing = this.world.getBlock(x, y, z);
    if (!getBlockDefinition(existing).replaceable) return false;
    if (this.player.intersectsBlock(x, y, z, 0.002)) {
      this.options.callbacks.onMessage('这里放不下方块');
      return false;
    }

    if (!this.survival) {
      const block = this.currentCreativeBlock;
      if (!this.world.setBlock(x, y, z, block)) return false;
      this.handleBlockPlace(x, y, z, block);
      return true;
    }

    const held = this.getHeldStack();
    if (!held) return false;
    const placeBlockId = getPlaceBlockId(held.itemId);
    if (placeBlockId === undefined) return false;
    const oldBlock = this.world.getBlock(x, y, z);
    if (!this.world.setBlock(x, y, z, placeBlockId)) return false;
    const removed = inventoryService.extract(this.survival.inventory, this.selectedSlot, 1);
    if (!removed) {
      this.world.setBlock(x, y, z, oldBlock);
      return false;
    }
    if (placeBlockId === BlockId.Furnace) this.survival.furnaces.getOrCreate(x, y, z);
    this.emitHotbar();
    this.handleBlockPlace(x, y, z, placeBlockId);
    return true;
  }

  private useBlockAt(x: number, y: number, z: number, block: BlockId): boolean {
    if (!this.survival) return false;
    const definition = getBlockDefinition(block);
    if (definition.interaction === 'crafting_table') {
      this.options.callbacks.onContainerRequested('crafting_table');
      return true;
    }
    if (definition.interaction === 'furnace') {
      this.survival.furnaces.getOrCreate(x, y, z);
      this.options.callbacks.onContainerRequested('furnace', { x, y, z });
      return true;
    }
    return false;
  }

  private setInventorySlot(slot: number, stack: ItemStack | null): void {
    if (!this.survival) return;
    const slots = this.survival.inventory.slots.map((entry) => cloneStack(entry));
    slots[slot] = stack;
    this.survival.inventory.replaceSlots(slots);
  }

  private handleBlockBreakEffects(
    x: number,
    y: number,
    z: number,
    definition: BlockDefinition,
  ): void {
    this.particles.spawnBlockBurst(x + 0.5, y + 0.5, z + 0.5, definition.particleColor, 15, 1);
    this.audio.playBreak(definition.hardness);
    this.scheduleSaveSoon();
  }

  private scheduleSaveSoon(): void {
    this.saveCountdown = Math.min(this.saveCountdown, 1.4);
  }

  private tickSaving(dt: number): void {
    if (this.container) return;
    this.saveCountdown -= dt;
    this.autosaveTimer += dt;
    if (this.saveCountdown <= 0) {
      this.saveCountdown = MAX_AUTOSAVE_SECONDS;
      void this.saveNow(false).catch((error: unknown) => this.handleSaveError(error));
    } else if (this.autosaveTimer >= MAX_AUTOSAVE_SECONDS) {
      this.autosaveTimer = 0;
      void this.saveNow(false).catch((error: unknown) => this.handleSaveError(error));
    }
  }

  private async performSave(notify: boolean): Promise<void> {
    if (this.disposed || this.container) return;
    const now = Date.now();
    this.meta.player = this.playerSnapshot();
    this.meta.hotbar = this.creativeHotbar.map((block) => block as number);
    this.meta.selectedSlot = this.selectedSlot;
    this.meta.timeOfDay = this.sky.currentTime;
    this.meta.renderDistance = this.settings.renderDistance;
    this.meta.lastPlayed = now;
    this.meta.lastPlayedAt = now;
    this.meta.schemaVersion = 2;
    this.meta.version = 2;

    const snapshots = this.world.getDirtyChunkEdits();
    this.saveSequence++;
    const saveBundle: SaveBundle = {
      world: { ...this.meta },
      player: this.buildPlayerSave(),
      chunkDeltas: snapshots.map((snapshot) => ({
        cx: snapshot.cx,
        cz: snapshot.cz,
        overrides: snapshot.edits,
      })),
      furnaces: this.survival?.furnaces.toSave() ?? [],
      itemEntities: this.survival?.items.toSave() ?? [],
      saveSequence: this.saveSequence,
    };

    try {
      await this.options.storage.saveBundle(saveBundle);
      this.saveCountdown = MAX_AUTOSAVE_SECONDS;
      this.autosaveTimer = 0;
      if (notify) this.options.callbacks.onSaved();
    } catch (error) {
      this.world.markChunkEditsDirty(snapshots.map(({ cx, cz }) => ({ cx, cz })));
      throw error;
    }
  }

  private playerSnapshot(): PlayerSnapshot {
    return {
      x: this.player.position.x,
      y: this.player.position.y,
      z: this.player.position.z,
      yaw: this.player.yaw,
      pitch: this.player.pitch,
    };
  }

  private emitStats(): void {
    if (this.disposed) return;
    this.options.callbacks.onStats(this.getStats());
  }

  private settlePlayerPosition(): void {
    if (this.player.position.y < -5) {
      this.respawnAtSurface();
      return;
    }
    if (!this.isPlayerColliding()) return;
    const x = Math.floor(this.player.position.x);
    const z = Math.floor(this.player.position.z);
    for (let y = Math.max(1, Math.floor(this.player.position.y)); y < CHUNK_HEIGHT - 2; y++) {
      this.player.position.y = y + 0.01;
      if (!this.isPlayerColliding()) {
        this.player.velocity.set(0, 0, 0);
        return;
      }
    }
    this.player.teleport(x + 0.5, Math.max(this.world.getSurfaceHeight(x, z) + 1.05, SEA_LEVEL + 2), z + 0.5);
  }

  private isPlayerColliding(): boolean {
    const minX = Math.floor(this.player.minX + 1e-4);
    const maxX = Math.floor(this.player.maxX - 1e-4);
    const minY = Math.floor(this.player.minY + 1e-4);
    const maxY = Math.floor(this.player.maxY - 1e-4);
    const minZ = Math.floor(this.player.minZ + 1e-4);
    const maxZ = Math.floor(this.player.maxZ - 1e-4);
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          if (this.world.isSolidAt(x, y, z)) return true;
        }
      }
    }
    return false;
  }

  private checkVoidRespawn(): void {
    if (this.player.position.y >= -20) return;
    this.respawnAtSurface();
    this.options.callbacks.onMessage('你掉出了世界，已返回地表');
  }

  private respawnAtSurface(): void {
    const x = this.player.position.x;
    const z = this.player.position.z;
    const surface = this.world.getSurfaceHeight(x, z);
    this.player.teleport(x, Math.max(surface + 1.05, SEA_LEVEL + 2), z);
    this.player.velocity.set(0, 0, 0);
  }

  private handleGenerationError(error: Error): void {
    const now = performance.now();
    if (now - this.lastGenerationErrorAt < 4000) return;
    this.lastGenerationErrorAt = now;
    console.warn('Chunk generation error', error);
    this.options.callbacks.onMessage('区块生成出现异常，正在使用备用生成器');
  }

  private handleSaveError(error: unknown): void {
    console.error('Failed to save world', error);
    this.options.callbacks.onMessage('自动保存失败，请检查浏览器存储空间');
  }
}

function sanitizeHotbar(input: number[]): BlockId[] {
  if (!Array.isArray(input) || input.length !== 9) return [...DEFAULT_HOTBAR];
  const result: BlockId[] = [];
  for (const value of input) {
    const definition: BlockDefinition | undefined = BLOCK_DEFS[value as BlockId];
    if (!definition || definition.id === BlockId.Air || definition.id === BlockId.Water || !definition.breakable) {
      return [...DEFAULT_HOTBAR];
    }
    result.push(definition.id);
  }
  return result;
}

function clampSlot(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(8, Math.floor(value)));
}

export type { BlockDefinition };
