import type { GameMode, PlayerSave, WorldMetadata, WorldSave, Stack } from '../core/types';
import { findSpawn } from '../world/generator';
import { hashString } from '../core/math';
import { WorldStorage, type WorldSummary } from '../persistence/storage';
import { AudioEngine } from '../audio/audio';
import { UI, type UiActions } from '../ui/ui';
import { GameSession, type Settings } from '../game/session';

const DEFAULT_SETTINGS: Settings = { sensitivity: .0022, volume: .55, renderDistance: 4, muted: false };
const emptySlots = (): (Stack | null)[] => Array.from({ length: 36 }, () => null);

export class VoxelCraftApp {
  readonly storage = new WorldStorage();
  readonly audio = new AudioEngine();
  readonly ui: UI;
  private session: GameSession | null = null;
  settings: Settings = { ...DEFAULT_SETTINGS };
  private switching = false;

  constructor(host: HTMLElement) {
    this.ui = new UI(host);
    this.ui.setActions(this.menuActions());
  }

  async boot(): Promise<void> {
    try {
      this.settings = await this.storage.setting('settings', this.settings);
    } catch {
      this.ui.toast('Local settings are unavailable. Progress may not persist.', 'error');
    }
    this.audio.setVolume(this.settings.volume);
    this.audio.setMuted(this.settings.muted);
    this.ui.applySettings(this.settings);
    await this.refreshWorlds();
  }

  private async refreshWorlds(): Promise<void> {
    let worlds: WorldSummary[] = [];
    try { worlds = await this.storage.list(); }
    catch (error) { this.ui.toast(`Cannot read local worlds: ${this.message(error)}`, 'error'); }
    this.ui.setActions(this.menuActions());
    this.ui.showMain(worlds);
  }

  private menuActions(): UiActions {
    return {
      onCreate: (name, seed, mode) => { void this.createWorld(name, seed, mode); },
      onLoad: id => { void this.loadWorld(id); },
      onDelete: id => { void this.deleteWorld(id); },
      onExport: id => { void this.exportWorld(id); },
      onImport: file => { void this.importWorld(file); },
      onResume: () => {},
      onSaveExit: () => {},
      onReturnMenu: () => {},
      onSettings: values => { void this.saveSettings(values); },
      onInventorySlot: () => {},
      onCraftResult: () => {},
      onFurnaceSlot: () => {},
      onCloseContainer: () => {},
      onRespawn: () => {},
      onDropItem: () => {},
      onToggleDebug: () => {},
    };
  }

  private async createWorld(name: string, seed: string, mode: GameMode): Promise<void> {
    if (this.switching) return;
    this.switching = true;
    try {
      await this.audio.unlock(); this.audio.play('click');
      this.ui.showLoading(name);
      this.ui.updateLoading(.04, 'Marking the seed…');
      const now = Date.now();
      const metadata: WorldMetadata = { id: crypto.randomUUID(), name: name.trim().slice(0, 40) || 'New world', seed: seed.trim() || String(now), mode, createdAt: now, updatedAt: now, version: 1 };
      const spawn = findSpawn(hashString(metadata.seed));
      const player: PlayerSave = { position: { x: spawn.x, y: spawn.y, z: spawn.z }, yaw: spawn.yaw ?? .7, pitch: -.12, health: 20, hunger: 20, oxygen: 10, time: 72, inventory: emptySlots(), selected: 0 };
      const save: WorldSave = { schema: 2, generator: 1, metadata, player, edits: {}, furnaces: {}, drops: [] };
      await this.storage.save(save);
      await this.openSession(metadata, save);
    } catch (error) {
      this.ui.showMain([]);
      this.ui.toast(`Could not create world: ${this.message(error)}`, 'error');
      await this.refreshWorlds();
    } finally { this.switching = false; }
  }

  private async loadWorld(id: string): Promise<void> {
    if (this.switching) return;
    this.switching = true;
    try {
      await this.audio.unlock(); this.audio.play('click');
      const save = await this.storage.load(id);
      if (!save) throw new Error('That world no longer exists');
      this.ui.showLoading(save.metadata.name);
      await this.openSession(save.metadata, save);
    } catch (error) {
      this.ui.toast(`Could not open world: ${this.message(error)}`, 'error');
      await this.refreshWorlds();
    } finally { this.switching = false; }
  }

  private async openSession(metadata: WorldMetadata, save: WorldSave): Promise<void> {
    this.disposeSession();
    this.ui.showLoading(metadata.name);
    await new Promise(resolve => setTimeout(resolve, 30));
    const host = document.querySelector<HTMLElement>('#game-canvas');
    if (!host) throw new Error('Game canvas host missing');
    const session = new GameSession({
      metadata, save, storage: this.storage, host, ui: this.ui, audio: this.audio, settings: this.settings,
      onProgress: progress => this.ui.updateLoading(progress, progress < .35 ? 'Raising hills and carving caves…' : progress < .8 ? 'Growing forests and scattering light…' : 'Weaving the final chunks…'),
      onReady: () => {
        this.ui.toast('The world is ready. Click to look around.', 'success');
        this.installTestHook();
      },
      onSaveError: message => { this.ui.toast(`Save failed: ${message}`, 'error'); this.ui.hideSaving(); },
      onExitRequested: () => { void this.exitToMenu(); },
      onWorldUpdated: () => {},
    });
    this.session = session;
  }

  private async exitToMenu(): Promise<void> {
    this.disposeSession();
    await this.refreshWorlds();
  }

  private disposeSession() {
    if (!this.session) return;
    try { this.session.dispose(); } catch (error) { console.error('Session disposal failed', error); }
    this.session = null;
    delete (window as Window & { __VOXELCRAFT__?: unknown }).__VOXELCRAFT__;
  }

  private async deleteWorld(id: string): Promise<void> {
    try {
      await this.storage.delete(id);
      this.audio.play('click');
      this.ui.toast('World deleted.', 'success');
      await this.refreshWorlds();
    } catch (error) { this.ui.toast(`Delete failed: ${this.message(error)}`, 'error'); }
  }

  private async exportWorld(id: string): Promise<void> {
    try {
      const json = await this.storage.export(id);
      const world = await this.storage.load(id);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `${(world?.metadata.name ?? 'voxelcraft').replace(/[^a-z0-9_-]+/gi, '-')}.voxel.json`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.ui.toast('World archive downloaded.', 'success');
    } catch (error) { this.ui.toast(`Export failed: ${this.message(error)}`, 'error'); }
  }

  private async importWorld(file: File): Promise<void> {
    try {
      const imported = await this.storage.import(await file.text());
      this.ui.toast(`Imported “${imported.metadata.name}”.`, 'success');
      await this.refreshWorlds();
    } catch (error) { this.ui.toast(`Import failed: ${this.message(error)}`, 'error'); }
  }

  private async saveSettings(values: Settings): Promise<void> {
    this.settings = values;
    this.audio.setVolume(values.volume); this.audio.setMuted(values.muted);
    try { await this.storage.setSetting('settings', values); }
    catch (error) { this.ui.toast(`Settings could not be saved: ${this.message(error)}`, 'error'); }
  }

  private installTestHook() {
    const session = this.session;
    (window as Window & { __VOXELCRAFT__?: unknown }).__VOXELCRAFT__ = {
      version: '3.1.0', ready: !!session,
      stats: () => session?.getStats(),
      seed: () => session?.metadata.seed,
      inventory: () => session?.inventory.slots.map(s => s ? { ...s } : null),
      position: () => session ? { ...session.player.position } : null,
      chunks: () => session?.world.chunks.size,
    };
  }

  private message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
}

export function bootVoxelCraft(): void {
  const host = document.querySelector<HTMLElement>('#app');
  if (!host) throw new Error('Missing #app');
  const app = new VoxelCraftApp(host);
  void app.boot().catch(error => {
    host.innerHTML = `<main class="fatal-error"><h1>VoxelCraft could not start</h1><p>${error instanceof Error ? error.message : String(error)}</p><p>Try a current browser with WebGL 2 enabled.</p></main>`;
  });
}
