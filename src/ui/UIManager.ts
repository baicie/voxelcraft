import type { GameStats, HotbarState } from '../app/GameEvents';
import type { GameSettings } from '../persistence/SettingsStore';
import type { WorldRecord } from '../persistence/WorldStorage';
import type { TextureAtlas } from '../rendering/TextureAtlas';
import { HUD } from './HUD';
import { LoadingScreen } from './LoadingScreen';
import { MainMenu } from './MainMenu';
import { PauseMenu } from './PauseMenu';
import { SettingsPanel } from './SettingsPanel';
import { createElement } from './dom';
import { WorldCreateDialog } from './WorldCreateDialog';
import { WorldSelectDialog } from './WorldSelectDialog';
import { ContainerScreen, type ContainerHandlers } from './ContainerScreen';
import type { ContainerView } from '../inventory/ContainerSession';

export interface UIManagerHooks {
  onStartWorld: (world: WorldRecord) => void;
  onCreateWorld: (name: string, seed: string, mode: 'creative' | 'survival', difficulty: 'peaceful' | 'normal') => void;
  onSettingsChanged: (settings: GameSettings) => void;
  onResume: () => void;
  onSave: () => void;
  onQuitWorld: () => void;
  onStartPlay: () => void;
}

export class UIManager {
  private readonly root: HTMLElement;
  private readonly hooks: UIManagerHooks;
  private settings: GameSettings;
  private worlds: WorldRecord[] = [];
  private menu: MainMenu | null = null;
  private hud: HUD | null = null;
  private loading: LoadingScreen | null = null;
  private pause: PauseMenu | null = null;
  private settingsPanel: SettingsPanel | null = null;
  private createDialog: WorldCreateDialog | null = null;
  private worldSelect: WorldSelectDialog | null = null;
  private startPrompt: HTMLElement | null = null;
  private containerScreen: ContainerScreen | null = null;
  private atlas: TextureAtlas | null = null;
  private toastNode: HTMLElement | null = null;
  private toastTimer = 0;

  constructor(root: HTMLElement, settings: GameSettings, hooks: UIManagerHooks) {
    this.root = root;
    this.settings = settings;
    this.hooks = hooks;
  }

  showMainMenu(worlds: WorldRecord[]): void {
    this.clearRoot();
    this.worlds = worlds;
    this.menu = new MainMenu({
      worlds,
      onContinue: (world) => this.hooks.onStartWorld(world),
      onCreate: () => this.openCreateDialog(),
      onWorlds: () => this.openWorldSelect(),
      onSettings: () => this.openSettings('menu'),
    });
    this.root.append(this.menu.element);
  }

  openCreateDialog(): void {
    if (this.createDialog) return;
    this.createDialog = new WorldCreateDialog({
      onCreate: ({ name, seed, mode, difficulty }) => {
        this.createDialog?.setBusy();
        this.hooks.onCreateWorld(name, seed, mode, difficulty);
      },
      onCancel: () => this.closeCreateDialog(),
    });
    this.root.append(this.createDialog.element);
  }

  closeCreateDialog(): void {
    this.createDialog?.element.remove();
    this.createDialog = null;
  }

  openWorldSelect(): void {
    if (this.worldSelect) return;
    this.worldSelect = new WorldSelectDialog({
      worlds: this.worlds,
      onSelect: (world) => {
        this.closeWorldSelect();
        this.hooks.onStartWorld(world);
      },
      onCancel: () => this.closeWorldSelect(),
    });
    this.root.append(this.worldSelect.element);
  }

  closeWorldSelect(): void {
    this.worldSelect?.element.remove();
    this.worldSelect = null;
  }

  openSettings(origin: 'menu' | 'pause'): void {
    if (this.settingsPanel) return;
    this.settingsPanel = new SettingsPanel({
      settings: this.settings,
      onChange: (settings) => {
        this.settings = settings;
        this.hooks.onSettingsChanged(settings);
      },
      onClose: () => this.closeSettings(),
    });
    this.settingsPanel.element.dataset.origin = origin;
    this.root.append(this.settingsPanel.element);
  }

  closeSettings(): void {
    this.settingsPanel?.element.remove();
    this.settingsPanel = null;
  }

  showLoading(world: WorldRecord): void {
    this.clearRoot();
    this.loading = new LoadingScreen(world);
    this.loading.update(0, '准备区块数据');
    this.root.append(this.loading.element);
  }

  updateLoading(progress: number, label: string): void {
    this.loading?.update(progress, label);
  }

  showHUD(atlas: TextureAtlas, hotbar: HotbarState): void {
    this.clearRoot();
    this.atlas = atlas;
    this.hud = new HUD(atlas, hotbar);
    this.hud.setDebugVisible(this.settings.showDebug);
    this.root.append(this.hud.element);
  }

  showContainer(view: ContainerView, handlers: ContainerHandlers): void {
    if (!this.atlas) return;
    this.hideContainer();
    this.containerScreen = new ContainerScreen(view, this.atlas, handlers);
    this.root.append(this.containerScreen.element);
  }

  updateContainer(view: ContainerView): void {
    this.containerScreen?.update(view);
  }

  hideContainer(): void {
    this.containerScreen?.element.remove();
    this.containerScreen = null;
  }

  get isContainerOpen(): boolean {
    return this.containerScreen !== null;
  }

  updateStats(stats: GameStats): void {
    this.hud?.updateStats(stats);
  }

  setHotbar(state: HotbarState): void {
    this.hud?.setHotbar(state);
  }

  setMiningProgress(progress: number): void {
    this.hud?.setMiningProgress(progress);
  }

  setDebugVisible(visible: boolean): void {
    this.hud?.setDebugVisible(visible);
  }

  showStartPrompt(): void {
    if (this.startPrompt) return;
    const prompt = createElement('div', 'start-prompt-layer');
    prompt.dataset.testid = 'start-prompt';
    prompt.innerHTML = `
      <div class="start-prompt-card">
        <span class="start-prompt-kicker">READY TO EXPLORE</span>
        <h2>进入世界</h2>
        <p>鼠标将被锁定用于第一人称视角。按 <span class="keycap">ESC</span> 随时暂停。</p>
        <button type="button" class="menu-button menu-button-primary start-prompt-button" data-testid="btn-play">
          点击开始游玩
        </button>
        <div class="start-prompt-controls">
          <span><b>WASD</b> 移动</span>
          <span><b>SPACE</b> 跳跃</span>
          <span><b>LMB</b> 挖掘</span>
          <span><b>RMB</b> 放置</span>
        </div>
      </div>
    `;
    prompt.querySelector<HTMLButtonElement>('[data-testid="btn-play"]')!.addEventListener('click', () => this.hooks.onStartPlay());
    this.startPrompt = prompt;
    this.root.append(prompt);
    requestAnimationFrame(() => prompt.querySelector<HTMLButtonElement>('button')?.focus());
  }

  hideStartPrompt(): void {
    this.startPrompt?.remove();
    this.startPrompt = null;
  }

  showPause(world: WorldRecord): void {
    if (this.pause) return;
    this.pause = new PauseMenu({
      world,
      onResume: () => this.hooks.onResume(),
      onSave: () => this.hooks.onSave(),
      onSettings: () => this.openSettings('pause'),
      onQuit: () => this.hooks.onQuitWorld(),
    });
    this.root.append(this.pause.element);
  }

  hidePause(): void {
    this.pause?.element.remove();
    this.pause = null;
  }

  setPauseBusy(busy: boolean, label?: string): void {
    if (!this.pause) return;
    if (busy) this.pause.setBusy(label);
    else this.pause.setIdle();
  }

  toast(message: string, duration = 2600): void {
    if (this.hud) {
      this.hud.showToast(message, duration);
      return;
    }
    if (!this.toastNode || !this.toastNode.isConnected) {
      this.toastNode = createElement('div', 'floating-toast');
      this.root.append(this.toastNode);
    }
    this.toastNode.textContent = message;
    this.toastNode.classList.add('is-visible');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastNode?.classList.remove('is-visible');
    }, duration);
  }

  showFatalError(title: string, message: string): void {
    this.clearRoot();
    const layer = createElement('div', 'modal-layer fatal-layer');
    layer.dataset.testid = 'fatal-error';
    layer.innerHTML = `
      <div class="modal-backdrop"></div>
      <section class="modal dialog fatal-dialog">
        <span class="dialog-kicker">SYSTEM MESSAGE</span>
        <h2></h2>
        <p></p>
        <button type="button" class="menu-button menu-button-primary" data-testid="btn-reload">重新加载</button>
      </section>
    `;
    layer.querySelector('h2')!.textContent = title;
    layer.querySelector('p')!.textContent = message;
    layer.querySelector<HTMLButtonElement>('button')!.addEventListener('click', () => window.location.reload());
    this.root.append(layer);
  }

  closeSettingsIfOpen(): boolean {
    if (!this.settingsPanel) return false;
    this.closeSettings();
    return true;
  }

  closeMenuModal(): boolean {
    if (this.createDialog) {
      this.closeCreateDialog();
      return true;
    }
    if (this.worldSelect) {
      this.closeWorldSelect();
      return true;
    }
    if (this.settingsPanel) {
      this.closeSettings();
      return true;
    }
    return false;
  }

  get isPauseOpen(): boolean {
    return this.pause !== null;
  }

  get isStartPromptOpen(): boolean {
    return this.startPrompt !== null;
  }

  get isSettingsOpen(): boolean {
    return this.settingsPanel !== null;
  }

  get hasHud(): boolean {
    return this.hud !== null;
  }

  dispose(): void {
    window.clearTimeout(this.toastTimer);
    this.clearRoot();
  }

  private clearRoot(): void {
    window.clearTimeout(this.toastTimer);
    this.hud?.dispose();
    this.root.replaceChildren();
    this.menu = null;
    this.hud = null;
    this.loading = null;
    this.pause = null;
    this.settingsPanel = null;
    this.createDialog = null;
    this.worldSelect = null;
    this.startPrompt = null;
    this.containerScreen = null;
    this.toastNode = null;
    this.atlas = null;
  }
}
