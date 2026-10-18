import { SettingsStore, normalizeSettings, type GameSettings } from '../persistence/SettingsStore';
import { WorldStorage, type WorldRecord } from '../persistence/WorldStorage';
import type { GameCallbacks, GameStats, HotbarState } from './GameEvents';
import { UIManager } from '../ui/UIManager';
import { HOTBAR_BLOCKS } from '../world/BlockRegistry';
import { DEFAULT_RENDER_DISTANCE } from '../world/constants';
import { Game } from './Game';
import type { ContainerKind, ContainerView } from '../inventory/ContainerSession';
import type { ContainerHandlers } from '../ui/ContainerScreen';
import * as THREE from 'three';

type AppState = 'boot' | 'menu' | 'loading' | 'awaiting' | 'playing' | 'paused' | 'container' | 'exiting';

declare global {
  interface Window {
    __VOXELCRAFT_DEV__?: GameApp;
    __THREE_DEV__?: typeof THREE;
  }
}

export class GameApp {
  private readonly uiRoot: HTMLElement;
  private canvas: HTMLCanvasElement | null = null;
  private readonly storage = new WorldStorage();
  private readonly settingsStore = new SettingsStore();
  private settings: GameSettings;
  private ui: UIManager;
  private game: Game | null = null;
  private worlds: WorldRecord[] = [];
  private state: AppState = 'boot';
  private starting = false;
  private suppressPause = true;

  constructor(uiRoot: HTMLElement) {
    this.uiRoot = uiRoot;
    this.settings = this.settingsStore.load();
    this.ui = new UIManager(uiRoot, this.settings, {
      onStartWorld: (world) => void this.startWorld(world),
      onCreateWorld: (name, seed, mode, difficulty) => void this.createWorld(name, seed, mode, difficulty),
      onSettingsChanged: (settings) => this.handleSettingsChanged(settings),
      onResume: () => void this.enterGame(),
      onSave: () => void this.saveFromPause(),
      onQuitWorld: () => void this.quitToMenu(),
      onStartPlay: () => void this.enterGame(),
    });
  }

  async init(): Promise<void> {
    if (import.meta.env.DEV) {
      window.__VOXELCRAFT_DEV__ = this;
      window.__THREE_DEV__ = THREE;
    }
    try {
      await this.storage.init();
      this.worlds = await this.storage.listWorlds();
      this.state = 'menu';
      this.showMenu();
    } catch (error) {
      console.error('VoxelCraft failed to initialize storage', error);
      this.ui.showFatalError(
        '无法打开本地存档',
        `浏览器拒绝了 IndexedDB 访问，世界无法读取或保存。请检查隐私设置或换用支持 IndexedDB 的浏览器。\n${errorText(error)}`,
      );
      return;
    }

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private showMenu(): void {
    document.body.classList.remove('in-game');
    this.destroyCanvas();
    this.state = 'menu';
    this.ui.showMainMenu(this.worlds);
  }

  private createCanvas(): HTMLCanvasElement {
    this.destroyCanvas();
    const canvas = document.createElement('canvas');
    canvas.id = 'game-canvas';
    canvas.className = 'is-visible';
    canvas.setAttribute('aria-label', 'VoxelCraft 3D world');
    this.uiRoot.parentElement?.insertBefore(canvas, this.uiRoot);
    this.canvas = canvas;
    return canvas;
  }

  private destroyCanvas(): void {
    this.canvas?.remove();
    this.canvas = null;
  }

  private async startWorld(world: WorldRecord): Promise<void> {
    if (this.starting || this.game) return;
    this.starting = true;
    this.state = 'loading';
    this.suppressPause = true;
    const canvas = this.createCanvas();
    document.body.classList.add('in-game');
    this.ui.showLoading(world);

    try {
      const bundle = await this.storage.loadBundle(world.id);
      if (!bundle) throw new Error('找不到世界存档');
      const game = new Game({
        canvas,
        meta: bundle.world,
        playerSave: bundle.player,
        edits: bundle.edits,
        furnaces: bundle.furnaces,
        itemEntities: bundle.itemEntities,
        saveMeta: bundle.saveMeta,
        settings: this.settings,
        storage: this.storage,
        callbacks: this.createGameCallbacks(),
      });
      this.game = game;
      await game.prepare((progress, label) => this.ui.updateLoading(progress, label));
      if (this.game !== game) {
        game.dispose();
        return;
      }
      this.ui.showHUD(game.atlas, game.getHotbarState());
      this.ui.updateStats(game.getStats());
      game.setPaused(true);
      game.start();
      this.state = 'awaiting';
      this.suppressPause = false;
      this.ui.showStartPrompt();
    } catch (error) {
      console.error('Unable to start world', error);
      this.suppressPause = true;
      this.game?.dispose();
      this.game = null;
      this.destroyCanvas();
      this.worlds = await this.storage.listWorlds().catch(() => this.worlds);
      this.showMenu();
      this.ui.toast(`无法进入世界：${errorText(error)}`, 5000);
    } finally {
      this.starting = false;
    }
  }

  private async createWorld(
    name: string,
    seed: string,
    mode: 'creative' | 'survival',
    difficulty: 'peaceful' | 'normal',
  ): Promise<void> {
    if (this.starting) return;
    const now = Date.now();
    const normalizedSeed = seed.trim() || String(Math.floor(Math.random() * 2_147_483_647));
    const record: WorldRecord = {
      id: createId(),
      name: name.trim().slice(0, 32) || '未命名世界',
      seed: normalizedSeed.slice(0, 64),
      schemaVersion: 2,
      generatorVersion: 2,
      mode,
      difficulty,
      cheatsEnabled: false,
      createdAt: now,
      lastPlayed: now,
      lastPlayedAt: now,
      player: null,
      hotbar: HOTBAR_BLOCKS.map((block) => block as number),
      selectedSlot: 0,
      timeOfDay: 0.31,
      renderDistance: this.settings.renderDistance || DEFAULT_RENDER_DISTANCE,
      version: 2,
    };
    try {
      await this.storage.putWorld(record);
      this.worlds = [record, ...this.worlds.filter((entry) => entry.id !== record.id)];
      await this.startWorld(record);
    } catch (error) {
      console.error('Unable to create world', error);
      this.ui.toast(`创建世界失败：${errorText(error)}`, 5000);
      this.worlds = await this.storage.listWorlds().catch(() => this.worlds);
      this.showMenu();
    }
  }

  private async enterGame(): Promise<void> {
    if (!this.game || this.state === 'loading' || this.state === 'exiting' || this.state === 'container') return;
    try {
      await this.game.requestPointerLock();
    } catch (error) {
      console.warn('Pointer lock rejected', error);
      this.ui.toast('浏览器未授予鼠标锁定，请再次点击画面', 3500);
    }
  }

  private openContainer(kind: ContainerKind, furnacePos?: { x: number; y: number; z: number }): void {
    if (!this.game || this.state !== 'playing') return;
    const view = this.game.openContainer(kind, furnacePos);
    if (!view) return;
    this.state = 'container';
    this.suppressPause = false;
    this.ui.showContainer(view, this.createContainerHandlers());
    this.ui.setHotbar(this.game.getHotbarState());
    this.game.exitPointerLock();
  }

  private createContainerHandlers(): ContainerHandlers {
    return {
      onInventoryClick: (slot, button, shift) => {
        const view = this.game?.containerClickInventory(slot, button, shift);
        if (view) this.updateContainer(view);
      },
      onCraftGridClick: (slot, button, shift) => {
        const view = this.game?.containerClickCraftGrid(slot, button, shift);
        if (view) this.updateContainer(view);
      },
      onCraftOutputClick: (shift) => {
        const view = this.game?.containerTakeCraftOutput(shift);
        if (view) this.updateContainer(view);
      },
      onFurnaceClick: (slot, button, shift) => {
        const view = this.game?.containerClickFurnaceSlot(slot, button, shift);
        if (view) this.updateContainer(view);
      },
      onClose: () => this.closeContainerFromUi(),
    };
  }

  private updateContainer(view: ContainerView): void {
    this.ui.updateContainer(view);
    if (this.game) this.ui.setHotbar(this.game.getHotbarState());
  }

  private closeContainerFromUi(): void {
    if (!this.game || this.state !== 'container') return;
    this.game.closeContainer();
  }

  private handleContainerClosed(): void {
    this.ui.hideContainer();
    if (!this.game || this.state === 'exiting') return;
    this.state = 'paused';
    void this.game.requestPointerLock().catch(() => {
      if (this.state !== 'paused' || !this.game) return;
      this.game.setPaused(true);
      this.ui.showPause(this.game.meta);
    });
  }

  private handlePointerLockChanged(locked: boolean): void {
    if (!this.game || this.state === 'loading' || this.state === 'exiting' || this.suppressPause) {
      return;
    }
    if (this.state === 'container') return;
    if (locked) {
      this.state = 'playing';
      this.ui.hideStartPrompt();
      this.ui.hidePause();
      this.ui.closeSettingsIfOpen();
      this.game.setPaused(false);
      return;
    }

    if (this.ui.isSettingsOpen) {
      this.game.setPaused(true);
      return;
    }
    if (this.state === 'awaiting' && this.ui.isStartPromptOpen) {
      this.game.setPaused(true);
      return;
    }

    this.state = 'paused';
    this.game.setPaused(true);
    void this.game.saveNow(false).catch((error: unknown) => {
      console.error('Save on pause failed', error);
      this.ui.toast('暂停时自动保存失败');
    });
    this.ui.showPause(this.game.meta);
  }

  private async saveFromPause(): Promise<void> {
    if (!this.game) return;
    this.ui.setPauseBusy(true, '正在保存…');
    try {
      await this.game.saveNow(true);
    } catch (error) {
      console.error('Manual save failed', error);
      this.ui.toast(`保存失败：${errorText(error)}`, 5000);
    } finally {
      this.ui.setPauseBusy(false);
    }
  }

  private async quitToMenu(): Promise<void> {
    if (!this.game || this.state === 'exiting') return;
    const game = this.game;
    this.state = 'exiting';
    this.suppressPause = true;
    if (game.isContainerOpen) {
      game.closeContainer();
      this.ui.hideContainer();
    }
    this.ui.setPauseBusy(true, '正在保存…');
    game.setPaused(true);
    try {
      await game.saveNow(false);
    } catch (error) {
      console.error('Save before quit failed', error);
      this.ui.toast('退出前保存失败，部分修改可能未写入');
    }
    game.exitPointerLock();
    game.dispose();
    this.game = null;
    document.body.classList.remove('in-game');
    this.destroyCanvas();
    this.suppressPause = false;
    this.worlds = await this.storage.listWorlds().catch(() => this.worlds);
    this.showMenu();
  }

  private handleSettingsChanged(settings: GameSettings): void {
    this.settings = normalizeSettings(settings);
    this.settingsStore.save(this.settings);
    this.game?.applySettings(this.settings);
    this.ui.setDebugVisible(this.settings.showDebug);
  }

  private handleResize = (): void => {
    this.game?.resize();
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    const editing =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable);
    if (editing) return;

    if (this.state === 'container' && (event.code === 'Escape' || event.code === 'KeyE')) {
      event.preventDefault();
      this.closeContainerFromUi();
      return;
    }
    if (event.code !== 'Escape') return;
    if (this.ui.isSettingsOpen) {
      event.preventDefault();
      this.ui.closeSettingsIfOpen();
      return;
    }
    if (this.ui.closeMenuModal()) {
      event.preventDefault();
      return;
    }
    if (this.ui.isPauseOpen) {
      event.preventDefault();
      void this.enterGame();
      return;
    }
    if (this.ui.isStartPromptOpen) {
      event.preventDefault();
      void this.enterGame();
      return;
    }
    if (this.state === 'playing' && this.game) {
      this.game.exitPointerLock();
    }
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden && this.game) {
      if (this.state === 'playing') this.game.exitPointerLock();
      void this.game.saveNow(false).catch(() => undefined);
    }
  };

  private handleBeforeUnload = (): void => {
    if (this.game) void this.game.saveNow(false).catch(() => undefined);
  };

  private createGameCallbacks(): GameCallbacks {
    return {
      onStats: (stats: GameStats) => this.ui.updateStats(stats),
      onHotbar: (state: HotbarState) => this.ui.setHotbar(state),
      onPointerLockChanged: (locked) => this.handlePointerLockChanged(locked),
      onMiningProgress: (progress) => this.ui.setMiningProgress(progress),
      onMessage: (message) => this.ui.toast(message),
      onSaved: () => this.ui.toast('进度已保存'),
      onContainerRequested: (kind, furnacePos) => this.openContainer(kind, furnacePos),
      onContainerChanged: (view) => this.ui.updateContainer(view),
      onContainerClosed: () => this.handleContainerClosed(),
    };
  }
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `world-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
