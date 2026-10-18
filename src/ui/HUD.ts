import type { GameStats, HotbarState } from '../app/GameEvents';
import type { TextureAtlas } from '../rendering/TextureAtlas';
import { createElement, formatClock } from './dom';
import { Hotbar } from './Hotbar';

export class HUD {
  readonly element: HTMLElement;
  readonly hotbar: Hotbar;
  private readonly fps: HTMLElement;
  private readonly frame: HTMLElement;
  private readonly coords: HTMLElement;
  private readonly chunk: HTMLElement;
  private readonly chunks: HTMLElement;
  private readonly meshes: HTMLElement;
  private readonly meshBuild: HTMLElement;
  private readonly drawCalls: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly state: HTMLElement;
  private readonly target: HTMLElement;
  private readonly selected: HTMLElement;
  private readonly simDrop: HTMLElement;
  private readonly debugPanel: HTMLElement;
  private readonly mineRing: HTMLElement;
  private toastNode: HTMLElement | null = null;
  private toastTimer = 0;

  constructor(atlas: TextureAtlas, hotbarState: HotbarState) {
    this.element = createElement('div', 'hud-layer');
    this.element.dataset.testid = 'hud';
    this.element.innerHTML = `
      <div class="hud-vignette" aria-hidden="true"></div>
      <div class="debug-panel" data-testid="debug-panel">
        <div class="debug-title"><span class="debug-dot"></span>VOXELCRAFT <em>DEBUG</em></div>
        <div class="debug-grid">
          <span>FPS</span><strong data-debug="fps">--</strong>
          <span>FRAME</span><strong data-debug="frame">--</strong>
          <span>XYZ</span><strong data-debug="coords">--</strong>
          <span>CHUNK</span><strong data-debug="chunk">--</strong>
          <span>CHUNKS</span><strong data-debug="chunks">--</strong>
          <span>MESH</span><strong data-debug="meshes">--</strong>
          <span>MESHB</span><strong data-debug="meshbuild">--</strong>
          <span>DRAW</span><strong data-debug="draw">--</strong>
          <span>TIME</span><strong data-debug="clock">--</strong>
          <span>STATE</span><strong data-debug="state">--</strong>
          <span>ITEM</span><strong data-debug="selected">--</strong>
          <span>TARGET</span><strong data-debug="target">--</strong>
          <span>SIMDROP</span><strong data-debug="simdrop">--</strong>
        </div>
      </div>
      <div class="hud-brand">
        <span class="hud-brand-name">VOXELCRAFT</span>
        <span class="hud-brand-meta">${hotbarState.mode === 'survival' ? 'SURVIVAL · SEED-GROWN WORLD' : 'CREATIVE · SEED-GROWN WORLD'}</span>
      </div>
      ${hotbarState.mode === 'survival' ? `
        <div class="hud-goal">
          <span class="hud-goal-kicker">SURVIVAL GOAL</span>
          <strong>砍树 → 木板 → 工作台 → 木镐</strong>
          <span class="hud-goal-sub">E 打开背包 · 右键工作台/熔炉</span>
        </div>` : ''}
      <div class="crosshair" aria-hidden="true">
        <span class="crosshair-line crosshair-horizontal"></span>
        <span class="crosshair-line crosshair-vertical"></span>
        <span class="crosshair-ring"></span>
      </div>
      <div class="hud-hint">
        <span><b>WASD</b> 移动</span>
        <span><b>SPACE</b> 跳跃</span>
        <span><b>CTRL</b> 疾跑</span>
        <span><b>SHIFT</b> 潜行</span>
        ${hotbarState.mode === 'survival' ? '<span><b>E</b> 背包</span><span><b>右键</b> 交互/放置</span>' : '<span><b>F</b> 飞行</span><span><b>右键</b> 放置</span>'}
        <span><b>ESC</b> 暂停</span>
      </div>
      <div class="hud-hotbar-wrap"></div>
      <div class="hud-toast" role="status" aria-live="polite"></div>
    `;
    this.fps = this.element.querySelector<HTMLElement>('[data-debug="fps"]')!;
    this.frame = this.element.querySelector<HTMLElement>('[data-debug="frame"]')!;
    this.coords = this.element.querySelector<HTMLElement>('[data-debug="coords"]')!;
    this.chunk = this.element.querySelector<HTMLElement>('[data-debug="chunk"]')!;
    this.chunks = this.element.querySelector<HTMLElement>('[data-debug="chunks"]')!;
    this.meshes = this.element.querySelector<HTMLElement>('[data-debug="meshes"]')!;
    this.meshBuild = this.element.querySelector<HTMLElement>('[data-debug="meshbuild"]')!;
    this.drawCalls = this.element.querySelector<HTMLElement>('[data-debug="draw"]')!;
    this.clock = this.element.querySelector<HTMLElement>('[data-debug="clock"]')!;
    this.state = this.element.querySelector<HTMLElement>('[data-debug="state"]')!;
    this.selected = this.element.querySelector<HTMLElement>('[data-debug="selected"]')!;
    this.simDrop = this.element.querySelector<HTMLElement>('[data-debug="simdrop"]')!;
    this.target = this.element.querySelector<HTMLElement>('[data-debug="target"]')!;
    this.debugPanel = this.element.querySelector<HTMLElement>('.debug-panel')!;
    this.mineRing = this.element.querySelector<HTMLElement>('.crosshair-ring')!;
    this.hotbar = new Hotbar(atlas, hotbarState);
    this.element.querySelector<HTMLElement>('.hud-hotbar-wrap')!.append(this.hotbar.element);
  }

  updateStats(stats: GameStats): void {
    this.fps.textContent = `${Math.round(stats.fps)} FPS`;
    this.fps.className = stats.fps >= 50 ? 'good' : stats.fps >= 30 ? 'warn' : 'bad';
    this.frame.textContent = `${stats.frameMs.toFixed(1)} ms`;
    this.coords.textContent = `${stats.x.toFixed(1)} / ${stats.y.toFixed(1)} / ${stats.z.toFixed(1)}`;
    this.chunk.textContent = `${stats.chunkX}, ${stats.chunkZ}`;
    this.chunks.textContent = `${stats.loadedChunks} loaded · ${stats.pendingChunks} queued`;
    this.meshes.textContent = `${stats.meshedChunks} chunks · ${stats.faces.toLocaleString('en-US')} faces`;
    this.meshBuild.textContent = `${stats.meshBuildMs.toFixed(1)} ms / chunk`;
    this.drawCalls.textContent = `${stats.drawCalls} calls · ${(stats.triangles / 1000).toFixed(1)}k tris`;
    this.clock.textContent = `${formatClock(stats.timeOfDay)} · ${stats.timeOfDay < 0.26 || stats.timeOfDay > 0.76 ? 'NIGHT' : 'DAY'}`;
    this.state.textContent = `${stats.mode === 'survival' ? 'SURVIVAL' : stats.flying ? 'FLY' : stats.inWater ? 'SWIM' : 'WALK'} · R${stats.renderDistance}`;
    this.selected.textContent = stats.selectedCount > 0 ? `${stats.selectedItem} ×${stats.selectedCount}` : stats.selectedItem;
    this.simDrop.textContent = `${stats.simulationDroppedMs.toFixed(0)} ms`;
    this.target.textContent = stats.target;
    this.hotbar.setSelected(stats.selectedSlot);
  }

  setHotbar(state: HotbarState): void {
    this.hotbar.setState(state);
  }

  setDebugVisible(visible: boolean): void {
    this.debugPanel.hidden = !visible;
  }

  setMiningProgress(progress: number): void {
    const clamped = Math.max(0, Math.min(1, progress));
    this.mineRing.style.setProperty('--mine-angle', `${clamped * 360}deg`);
    this.mineRing.classList.toggle('is-active', clamped > 0.001);
  }

  showToast(message: string, duration = 2600): void {
    let node = this.toastNode;
    if (!node || !node.isConnected) {
      node = this.element.querySelector<HTMLElement>('.hud-toast');
      this.toastNode = node;
    }
    if (!node) return;
    node.textContent = message;
    node.classList.add('is-visible');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      node?.classList.remove('is-visible');
    }, duration);
  }

  show(): void {
    this.element.classList.remove('is-hidden');
  }

  hide(): void {
    this.element.classList.add('is-hidden');
  }

  dispose(): void {
    window.clearTimeout(this.toastTimer);
    this.hotbar.dispose();
    this.element.remove();
  }
}
