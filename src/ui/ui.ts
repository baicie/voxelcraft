import type { Stack } from '../core/types';
import type { WorldSummary } from '../persistence/storage';
import { itemIcon } from '../render/atlas';
import { itemDef } from '../inventory/inventory';

export type InventorySource = 'inventory' | 'craft';
export type InventoryView = {
  slots: (Stack | null)[];
  craft: (Stack | null)[];
  craftSize: 2 | 3;
  result: Stack | null;
  table: boolean;
  recipes: { id: string; result: Stack; available: boolean }[];
};
export type FurnaceView = {
  input: Stack | null; fuel: Stack | null; output: Stack | null;
  burn: number; burnMax: number; progress: number;
};
export type HudView = {
  health: number; hunger: number; oxygen: number; mode: string; selected: number;
  slots: (Stack | null)[]; biome: string; clock: string; underwater: boolean; seed: string;
};
export type UiActions = {
  onCreate(name: string, seed: string, mode: 'survival' | 'creative'): void;
  onLoad(id: string): void;
  onDelete(id: string): void;
  onExport(id: string): void;
  onImport(file: File): void;
  onResume(): void;
  onSaveExit(): void;
  onReturnMenu(): void;
  onSettings(values: { sensitivity: number; volume: number; renderDistance: number; muted: boolean }): void;
  onInventorySlot(source: InventorySource, index: number, button: number, shift: boolean, x: number, y: number): void;
  onCraftResult(shift: boolean): void;
  onFurnaceSlot(slot: 'input' | 'fuel' | 'output', button: number, shift: boolean): void;
  onCloseContainer(): void;
  onRespawn(): void;
  onDropItem(): void;
  onToggleDebug(): void;
};

const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const slotHtml = (stack: Stack | null, source: InventorySource, index: number, cls = ''): string => {
  const def = stack ? itemDef(stack.id) : null;
  const durability = stack?.durability !== undefined && def && 'durability' in def ? (stack.durability / (def.durability ?? 1)) : null;
  return `<button class="item-slot ${cls}" data-source="${source}" data-index="${index}" ${stack ? '' : 'data-empty="true"'} title="${stack ? esc(def?.label ?? stack.id) : 'Empty'}">
    ${stack ? `<img draggable="false" src="${itemIcon(stack.id)}" alt="${esc(def?.label ?? stack.id)}">` : ''}
    ${stack && stack.count > 1 ? `<span class="item-count">${stack.count}</span>` : ''}
    ${durability !== null ? `<span class="durability"><i style="width:${Math.max(0, durability * 100)}%"></i></span>` : ''}
  </button>`;
};

export class UI {
  readonly root: HTMLElement;
  readonly canvasHost: HTMLElement;
  actions!: UiActions;
  private screen: HTMLElement;
  private main: HTMLElement;
  private loading: HTMLElement;
  private hud: HTMLElement;
  private pause: HTMLElement;
  private inventory: HTMLElement;
  private furnace: HTMLElement;
  private death: HTMLElement;
  private settings: HTMLElement;
  private help: HTMLElement;
  private debug: HTMLElement;
  private toastEl: HTMLElement;
  private inventoryView: InventoryView | null = null;
  private furnaceView: FurnaceView | null = null;
  private lastHud = 0;
  private heldItem: HTMLElement | null = null;
  private heldStack: Stack | null = null;

  get inventoryOpen() { return !this.inventory.classList.contains('hidden'); }
  get pauseVisible() { return !this.pause.classList.contains('hidden'); }
  get settingsHidden() { return this.settings.classList.contains('hidden'); }
  get simulationPaused() {
    return this.containerOpen || this.pauseVisible || !this.settingsHidden || !this.help.classList.contains('hidden') || !this.death.classList.contains('hidden') || !this.loading.classList.contains('hidden') || !this.main.classList.contains('hidden');
  }
  applySettings(values: { sensitivity: number; volume: number; renderDistance: number; muted: boolean }) {
    (this.settings.querySelector('#settings-sensitivity') as HTMLInputElement).value = String(values.sensitivity);
    (this.settings.querySelector('#settings-volume') as HTMLInputElement).value = String(values.volume);
    (this.settings.querySelector('#settings-mute') as HTMLInputElement).checked = values.muted;
    (this.settings.querySelector('#settings-distance') as HTMLInputElement).value = String(values.renderDistance);
    this.updateSettingLabels();
  }

  constructor(host: HTMLElement) {
    host.innerHTML = `<div id="game-canvas"></div>
    <div id="hud" class="hidden" data-testid="hud">
      <div id="crosshair"></div>
      <div id="underwater-filter"></div>
      <div id="damage-flash"></div>
      <div id="status-left"></div>
      <div id="vitals">
        <div id="health-row" data-testid="health"></div>
        <div id="hunger-row" data-testid="hunger"></div>
        <div id="oxygen-row"></div>
      </div>
      <div id="tool-label"></div>
      <div id="hotbar" data-testid="hotbar"></div>
      <div id="hud-info"></div>
      <div id="start-hint"></div>
    </div>
    <div id="screens"></div>
    <div id="toast" role="status"></div>
    <div id="debug-panel" class="hidden"></div>
    <div id="held-item" class="hidden"></div>
    <div id="vignette"></div>`;
    this.root = host;
    this.canvasHost = host.querySelector('#game-canvas')!;
    this.screen = host.querySelector('#screens')!;
    this.main = host.querySelector('#main-menu') ?? document.createElement('div');
    this.loading = this.loadingScreen();
    this.pause = this.pauseScreen();
    this.inventory = this.inventoryScreen();
    this.furnace = this.furnaceScreen();
    this.death = this.deathScreen();
    this.settings = this.settingsScreen();
    this.help = this.helpScreen();
    this.debug = host.querySelector('#debug-panel')!;
    this.toastEl = host.querySelector('#toast')!;
    this.hud = host.querySelector('#hud')!;
    this.heldItem = host.querySelector('#held-item')!;
    host.addEventListener('pointermove', event => {
      if (!this.heldItem || this.heldItem.classList.contains('hidden')) return;
      this.heldItem.style.left = `${event.clientX}px`; this.heldItem.style.top = `${event.clientY}px`;
    });
    this.setupGlobalClicks();
  }

  setActions(actions: UiActions) {
    this.actions = actions;
    this.bindStatic();
  }

  private setupGlobalClicks() {
    this.screen.addEventListener('click', event => {
      const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!target || !this.actions) return;
      const action = target.dataset.action;
      if (action === 'close-container') this.actions.onCloseContainer();
      if (action === 'close-help') this.hideHelp();
      if (action === 'close-settings') this.hideSettings();
      if (action === 'debug') this.actions.onToggleDebug();
    });
    this.screen.addEventListener('contextmenu', event => { if ((event.target as HTMLElement).closest('.item-slot')) event.preventDefault(); });
  }

  private bindStatic() {
    this.main.querySelector('#create-world-form')?.addEventListener('submit', event => {
      event.preventDefault();
      const name = (this.main.querySelector<HTMLInputElement>('#world-name')!).value.trim() || 'New world';
      const seed = (this.main.querySelector<HTMLInputElement>('#world-seed')!).value.trim() || String(Math.floor(Math.random() * 99999999));
      const mode = (this.main.querySelector<HTMLSelectElement>('#world-mode')!).value as 'survival' | 'creative';
      this.actions.onCreate(name, seed, mode);
    });
    this.main.querySelector('#show-create')?.addEventListener('click', () => this.openCreate());
    this.main.querySelector('#cancel-create')?.addEventListener('click', () => this.closeCreate());
    this.main.querySelector('#open-main-settings')?.addEventListener('click', () => this.showSettings());
    this.main.querySelector('#open-help')?.addEventListener('click', () => this.showHelp());
    this.main.querySelector('#import-world')?.addEventListener('change', event => {
      const file = (event.target as HTMLInputElement).files?.[0]; if (file) this.actions.onImport(file);
    });
    this.main.querySelector('#import-trigger')?.addEventListener('click', () => this.main.querySelector<HTMLInputElement>('#import-world')?.click());
    this.main.querySelector('#seed-random')?.addEventListener('click', () => {
      (this.main.querySelector<HTMLInputElement>('#world-seed')!).value = String(Math.floor(10000000 + Math.random() * 89999999));
    });
    this.pause.querySelector('#resume')?.addEventListener('click', () => this.actions.onResume());
    this.pause.querySelector('#save-exit')?.addEventListener('click', () => this.actions.onSaveExit());
    this.pause.querySelector('#pause-help')?.addEventListener('click', () => this.showHelp());
    this.pause.querySelector('#pause-settings')?.addEventListener('click', () => this.showSettings());
    this.pause.querySelector('#return-menu')?.addEventListener('click', () => this.actions.onReturnMenu());
    this.death.querySelector('#respawn')?.addEventListener('click', () => this.actions.onRespawn());
    this.settings.querySelector('#settings-close')?.addEventListener('click', () => this.closeSettingsAndResume());
    for (const id of ['settings-sensitivity', 'settings-volume', 'settings-distance']) {
      this.settings.querySelector(`#${id}`)?.addEventListener('input', () => this.saveSettings());
    }
    this.settings.querySelector('#settings-mute')?.addEventListener('change', () => this.saveSettings());
    this.inventory.addEventListener('click', event => this.onSlotClick(event, 'inventory'));
    this.furnace.addEventListener('click', event => this.onFurnaceClick(event));
    this.inventory.querySelector('#close-inventory')?.addEventListener('click', () => this.actions.onCloseContainer());
    this.inventory.querySelector('#drop-item')?.addEventListener('click', () => this.actions.onDropItem());
    this.furnace.querySelector('#close-furnace')?.addEventListener('click', () => this.actions.onCloseContainer());
    this.inventory.querySelector('#craft-result')?.addEventListener('click', event => this.actions.onCraftResult((event as MouseEvent).shiftKey));
  }

  private onSlotClick(event: MouseEvent, kind: 'inventory') {
    const slot = (event.target as HTMLElement).closest<HTMLElement>('.item-slot');
    if (!slot || !this.actions) return;
    event.preventDefault();
    if (slot.id === 'craft-result') {
      this.actions.onCraftResult(event.shiftKey); return;
    }
    if (slot.dataset.source === 'craft') this.actions.onInventorySlot('craft', Number(slot.dataset.index), event.button, event.shiftKey, event.clientX, event.clientY);
    else if (slot.dataset.source === 'inventory') this.actions.onInventorySlot('inventory', Number(slot.dataset.index), event.button, event.shiftKey, event.clientX, event.clientY);
    else if (kind === 'inventory') return;
  }

  private onFurnaceClick(event: MouseEvent) {
    const slot = (event.target as HTMLElement).closest<HTMLElement>('.furnace-slot');
    if (!slot) return;
    event.preventDefault();
    const name = slot.dataset.furnace as 'input' | 'fuel' | 'output';
    this.actions.onFurnaceSlot(name, event.button, event.shiftKey);
  }

  private loadingScreen(): HTMLElement {
    const el = document.createElement('div'); el.className = 'screen loading-screen'; el.dataset.testid = 'loading-screen';
    el.innerHTML = `<div class="loading-sky"><span></span><span></span><span></span></div>
      <div class="loading-content"><div class="brand-mark">VC</div><h2>Shaping the world</h2><p id="loading-world"></p>
      <div class="progress-track"><div id="loading-progress"></div></div><small id="loading-detail">Preparing terrain…</small>
      <div class="loading-tip">Tip: Torches keep the dark at bay.</div></div>`;
    this.screen.appendChild(el); return el;
  }
  private pauseScreen(): HTMLElement {
    const el = document.createElement('div'); el.className = 'screen centered-screen hidden'; el.dataset.testid = 'pause-menu';
    el.innerHTML = `<div class="panel pause-panel"><div class="eyebrow">PAUSED</div><h2>Take a breath.</h2><p class="muted">Your world is waiting.</p>
      <button class="btn primary wide" id="resume" data-testid="resume">Back to game</button>
      <button class="btn wide" id="pause-settings">Settings</button>
      <button class="btn wide" id="pause-help">Controls & guide</button>
      <button class="btn wide" id="save-exit" data-testid="save-exit">Save and quit</button>
      <button class="btn ghost wide" id="return-menu">Save and return to title</button></div>`;
    this.screen.appendChild(el); return el;
  }
  private inventoryScreen(): HTMLElement {
    const el = document.createElement('div'); el.className = 'screen dark-overlay hidden'; el.dataset.testid = 'inventory-screen';
    el.innerHTML = `<div class="inventory-layout panel">
      <header><div><div class="eyebrow">CARRY</div><h2 id="inventory-title">Backpack</h2></div><button class="icon-btn" id="close-inventory" aria-label="Close">×</button></header>
      <div class="inventory-content">
        <section class="crafting-section">
          <div class="crafting-row"><div id="craft-grid" class="craft-grid"></div><div class="craft-arrow">→</div><div id="craft-result" class="item-slot result-slot" data-source="result"></div></div>
          <div class="durability-note">Use a crafting table for 3×3 recipes.</div>
          <div class="inventory-grid" id="inventory-main"></div>
          <div class="hotbar-label">QUICK BAR</div>
          <div class="inventory-grid hotbar-grid" id="inventory-hotbar" data-testid="inventory-hotbar"></div>
          <div class="inventory-actions"><button class="btn small" id="drop-item">Drop selected</button><span class="muted">Left click move · right click split · Shift quick-move</span></div>
        </section>
        <aside class="recipe-book"><div class="eyebrow">FIELD NOTES</div><h3>Recipes</h3><div id="recipe-list"></div></aside>
      </div></div>`;
    this.screen.appendChild(el); return el;
  }
  private furnaceScreen(): HTMLElement {
    const el = document.createElement('div'); el.className = 'screen dark-overlay hidden'; el.dataset.testid = 'furnace-screen';
    el.innerHTML = `<div class="furnace-layout panel"><header><div><div class="eyebrow">SMELTING</div><h2>Stone furnace</h2></div><button class="icon-btn" id="close-furnace">×</button></header>
      <div class="furnace-workspace"><div class="furnace-column">
        <div class="furnace-slot" data-furnace="input" data-testid="furnace-input"></div><div class="flame">♨</div><div class="furnace-slot" data-furnace="fuel" data-testid="furnace-fuel"></div></div>
        <div class="furnace-progress"><div id="furnace-arrow">→</div><div class="progress-track small"><div id="furnace-bar"></div></div><div id="furnace-burn"></div></div>
        <div class="furnace-slot" data-furnace="output" data-testid="furnace-output"></div></div>
      <div class="inventory-grid" id="furnace-inventory"></div><p class="muted">Fuel burns while the upper slot can smelt. Iron ore requires a stone pickaxe.</p></div>`;
    this.screen.appendChild(el); return el;
  }
  private deathScreen(): HTMLElement {
    const el = document.createElement('div'); el.className = 'screen death-screen hidden'; el.dataset.testid = 'death-screen';
    el.innerHTML = `<div class="death-content"><div class="eyebrow">YOU DIED</div><h2>The wilds claimed you.</h2><p class="muted">Your belongings were scattered where you fell. Return if you dare.</p><button class="btn primary" id="respawn" data-testid="respawn">Respawn</button></div>`;
    this.screen.appendChild(el); return el;
  }
  private settingsScreen(): HTMLElement {
    const el = document.createElement('div'); el.className = 'screen centered-screen hidden settings-screen'; el.dataset.testid = 'settings-screen';
    el.innerHTML = `<div class="panel settings-panel"><header><div><div class="eyebrow">OPTIONS</div><h2>Settings</h2></div><button class="icon-btn" data-action="close-settings">×</button></header>
      <label class="setting-row"><span>Mouse sensitivity <output id="sensitivity-value"></output></span><input id="settings-sensitivity" type="range" min="0.0005" max="0.005" step="0.0001" value="0.0022"></label>
      <label class="setting-row"><span>Master volume <output id="volume-value"></output></span><input id="settings-volume" type="range" min="0" max="1" step="0.05" value="0.55"></label>
      <label class="setting-row"><span>Muted <input id="settings-mute" type="checkbox"></span></label>
      <label class="setting-row"><span>Render distance <output id="distance-value"></output></span><input id="settings-distance" type="range" min="2" max="6" step="1" value="4"></label>
      <p class="muted">Render distance applies when entering the world.</p></div>`;
    this.screen.appendChild(el); return el;
  }
  private helpScreen(): HTMLElement {
    const el = document.createElement('div'); el.className = 'screen centered-screen hidden help-screen'; el.dataset.testid = 'help-screen';
    el.innerHTML = `<div class="panel help-panel"><header><div><div class="eyebrow">FIELD GUIDE</div><h2>How to survive</h2></div><button class="icon-btn" data-action="close-help">×</button></header>
      <div class="help-grid"><div><h3>Controls</h3><dl><dt>WASD</dt><dd>Move</dd><dt>Mouse</dt><dd>Look</dd><dt>Space</dt><dd>Jump / swim</dd><dt>Ctrl</dt><dd>Sprint</dd><dt>Shift</dt><dd>Sneak</dd><dt>Left click</dt><dd>Mine / attack</dd><dt>Right click</dt><dd>Place / use / eat</dd><dt>E</dt><dd>Backpack</dd><dt>1–9 / wheel</dt><dd>Select item</dd><dt>Q</dt><dd>Drop one</dd><dt>F3</dt><dd>Debug overlay</dd><dt>Esc</dt><dd>Pause</dd></dl></div>
      <div><h3>First days</h3><ol><li>Punch oak logs, then open the backpack and craft planks.</li><li>Craft sticks, a crafting table and a wooden pickaxe.</li><li>Mine stone to upgrade to stone tools. Look for iron flecks.</li><li>Build a furnace, gather coal and smelt iron ore into ingots.</li><li>Light torches before night falls. Zombies stalk the dark.</li></ol>
      <h3>Creative flight</h3><p class="muted">Double-tap Space to toggle flight. Space rises, Shift descends.</p></div></div></div>`;
    this.screen.appendChild(el); return el;
  }

  showMain(worlds: WorldSummary[]) {
    this.hideAll();
    this.hideSaving();
    this.toastEl.className = '';
    this.main.remove();
    this.hud.classList.add('hidden'); this.debug.classList.add('hidden');
    const el = document.createElement('section'); el.className = 'screen main-menu'; el.id = 'main-menu'; el.dataset.testid = 'main-menu';
    const cards = worlds.length ? worlds.map(world => `<article class="world-card" data-world-id="${esc(world.id)}">
      <div class="world-thumb mode-${world.mode}"><span></span><b>${world.mode === 'creative' ? '∞' : '✦'}</b></div>
      <div class="world-info"><h3>${esc(world.name)}</h3><p>Seed ${esc(world.seed)} · ${world.mode}</p><small>${new Date(world.updatedAt).toLocaleDateString()}</small></div>
      <div class="world-actions"><button class="btn small primary play-world" data-testid="play-world" data-id="${esc(world.id)}">Play</button><button class="icon-btn export-world" data-id="${esc(world.id)}" title="Export">↓</button><button class="icon-btn delete-world" data-id="${esc(world.id)}" title="Delete">×</button></div>
    </article>`).join('') : `<div class="empty-worlds"><div class="empty-icon">◇</div><h3>A quiet horizon awaits</h3><p>Create a world to begin your story.</p></div>`;
    el.innerHTML = `<div class="menu-landscape" aria-hidden="true"><div class="sun-disc"></div><div class="cloud c1"></div><div class="cloud c2"></div><div class="cloud c3"></div><div class="ridge r1"></div><div class="ridge r2"></div><div class="ridge r3"></div><div class="floating-block b1"></div><div class="floating-block b2"></div></div>
      <div class="menu-top"><div class="logo"><span class="logo-cube"></span><div><h1>VOXEL<span>CRAFT</span></h1><p>An original voxel wilderness</p></div></div><div class="menu-meta"><button class="btn ghost" id="open-main-settings" data-testid="open-settings">Settings</button><button class="btn ghost" id="open-help">Field guide</button></div></div>
      <div class="menu-body"><div class="hero-copy"><div class="eyebrow">SURVIVE · BUILD · EXPLORE</div><h2>Every horizon is<br><em>yours to shape.</em></h2><p>Wander procedurally generated forests, mountains and caverns. Gather what the land offers. Build somewhere worth returning to.</p><button class="btn hero-btn" id="show-create" data-testid="new-world">Create a new world <span>→</span></button></div>
      <div class="world-drawer"><header><div><div class="eyebrow">YOUR WORLDS</div><h2>Continue a story</h2></div><button class="btn small ghost" id="import-trigger">Import</button><input type="file" id="import-world" accept="application/json" hidden></header><div class="world-list">${cards}</div></div></div>
      <form class="create-dialog panel hidden" id="create-world-form" data-testid="create-world-dialog"><header><div class="eyebrow">NEW WORLD</div><h2>Shape a beginning</h2></header>
        <label>World name<input id="world-name" data-testid="world-name" maxlength="40" placeholder="My wild place" required></label>
        <label>Seed <span class="seed-control"><input id="world-seed" data-testid="world-seed" maxlength="60" placeholder="Leave blank to surprise me"><button type="button" class="btn small ghost" id="seed-random">Random</button></span></label>
        <label>Game mode<select id="world-mode" data-testid="world-mode"><option value="survival">Survival — gather, craft, endure</option><option value="creative">Creative — build without limits</option></select></label>
        <div class="dialog-actions"><button type="button" class="btn ghost" id="cancel-create">Cancel</button><button class="btn primary" data-testid="create-world">Create world</button></div></form>
      <footer><span>VoxelCraft · K3.1 benchmark edition</span><span>Original procedural art & sound</span></footer>`;
    this.screen.appendChild(el); this.main = el;
    el.querySelectorAll<HTMLElement>('.world-card').forEach(card => {
      const id = card.dataset.worldId!;
      card.querySelector('.play-world')?.addEventListener('click', () => this.actions.onLoad(id));
      card.querySelector('.export-world')?.addEventListener('click', () => this.actions.onExport(id));
      card.querySelector('.delete-world')?.addEventListener('click', () => {
        if (confirm('Delete this world permanently? This cannot be undone.')) this.actions.onDelete(id);
      });
    });
    // Re-bind controls after replacing the menu DOM.
    this.bindMainEvents();
  }
  private bindMainEvents() {
    this.main.querySelector('#create-world-form')?.addEventListener('submit', event => {
      event.preventDefault();
      const name = (this.main.querySelector<HTMLInputElement>('#world-name')!).value.trim() || 'New world';
      const seed = (this.main.querySelector<HTMLInputElement>('#world-seed')!).value.trim() || String(Math.floor(Math.random() * 99999999));
      const mode = (this.main.querySelector<HTMLSelectElement>('#world-mode')!).value as 'survival' | 'creative';
      this.actions.onCreate(name, seed, mode);
    });
    this.main.querySelector('#show-create')?.addEventListener('click', () => this.openCreate());
    this.main.querySelector('#cancel-create')?.addEventListener('click', () => this.closeCreate());
    this.main.querySelector('#open-main-settings')?.addEventListener('click', () => this.showSettings());
    this.main.querySelector('#open-help')?.addEventListener('click', () => this.showHelp());
    this.main.querySelector('#import-world')?.addEventListener('change', event => {
      const file = (event.target as HTMLInputElement).files?.[0]; if (file) this.actions.onImport(file);
    });
    this.main.querySelector('#import-trigger')?.addEventListener('click', () => this.main.querySelector<HTMLInputElement>('#import-world')?.click());
    this.main.querySelector('#seed-random')?.addEventListener('click', () => {
      (this.main.querySelector<HTMLInputElement>('#world-seed')!).value = String(Math.floor(10000000 + Math.random() * 89999999));
    });
  }
  openCreate() { this.main.querySelector('#create-world-form')?.classList.remove('hidden'); setTimeout(() => this.main.querySelector<HTMLInputElement>('#world-name')?.focus(), 20); }
  closeCreate() { this.main.querySelector('#create-world-form')?.classList.add('hidden'); }
  showLoading(name: string) {
    this.hideAll(); this.main?.classList.add('hidden'); this.hud.classList.add('hidden');
    this.loading.classList.remove('hidden');
    const world = this.loading.querySelector('#loading-world'); if (world) world.textContent = name;
    this.updateLoading(0, 'Finding a gentle place to begin…');
  }
  updateLoading(progress: number, detail?: string) {
    const bar = this.loading.querySelector<HTMLElement>('#loading-progress');
    const label = this.loading.querySelector('#loading-detail');
    if (bar) bar.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
    if (label && detail) label.textContent = detail;
  }
  showGame() { this.hideAll(); this.hud.classList.remove('hidden'); }
  showPause() { this.pause.classList.remove('hidden'); }
  hidePause() { this.pause.classList.add('hidden'); }
  showDeath() { this.death.classList.remove('hidden'); this.hud.classList.add('hidden'); }
  hideDeath() { this.death.classList.add('hidden'); this.hud.classList.remove('hidden'); }
  hideAll() {
    this.main?.classList.add('hidden'); this.loading.classList.add('hidden'); this.pause.classList.add('hidden');
    this.inventory.classList.add('hidden'); this.furnace.classList.add('hidden'); this.death.classList.add('hidden');
    this.settings.classList.add('hidden'); this.help.classList.add('hidden');
  }
  get anyScreen() { return !this.loading.classList.contains('hidden') || !this.pause.classList.contains('hidden') || !this.inventory.classList.contains('hidden') || !this.furnace.classList.contains('hidden') || !this.death.classList.contains('hidden') || !this.settings.classList.contains('hidden') || !this.help.classList.contains('hidden') || !this.main.classList.contains('hidden'); }
  get containerOpen() { return !this.inventory.classList.contains('hidden') || !this.furnace.classList.contains('hidden'); }

  renderHud(view: HudView) {
    const now = performance.now(); if (now - this.lastHud < 80) return; this.lastHud = now;
    const hearts = Array.from({ length: 10 }, (_, i) => `<span class="heart ${i < Math.ceil(view.health / 2) ? '' : 'empty'}">♥</span>`).join('');
    const hunger = Array.from({ length: 10 }, (_, i) => `<span class="food ${i < Math.ceil(view.hunger / 2) ? '' : 'empty'}">◆</span>`).join('');
    this.root.querySelector('#health-row')!.innerHTML = hearts;
    this.root.querySelector('#hunger-row')!.innerHTML = hunger;
    this.root.querySelector('#oxygen-row')!.innerHTML = view.oxygen < 9.95 ? `<span class="air">${'○'.repeat(Math.ceil(view.oxygen))}</span>` : '';
    this.root.querySelector('#status-left')!.innerHTML = `<span class="mode-chip">${esc(view.mode)}</span><span class="clock">${esc(view.clock)}</span><span class="biome">${esc(view.biome)}</span>`;
    this.root.querySelector('#hud-info')!.innerHTML = `<span>Seed ${esc(view.seed)}</span>`;
    const hotbar = this.root.querySelector('#hotbar')!;
    hotbar.innerHTML = view.slots.slice(0, 9).map((slot, i) => slotHtml(slot, 'inventory', i, i === view.selected ? 'selected' : '')).join('');
    const selected = hotbar.querySelector('.selected');
    selected?.addEventListener('click', () => {});
    this.root.querySelector('#underwater-filter')?.classList.toggle('active', view.underwater);
    const selectedStack = view.slots[view.selected];
    this.root.querySelector('#tool-label')!.textContent = selectedStack ? (itemDef(selectedStack.id).label ?? selectedStack.id) : '';
  }
  showStartHint(text = 'Click to play') {
    const el = this.root.querySelector('#start-hint')!; el.textContent = text; el.classList.remove('hidden');
  }
  hideStartHint() { this.root.querySelector('#start-hint')?.classList.add('hidden'); }
  flashDamage() { const el = this.root.querySelector('#damage-flash') as HTMLElement; el.animate([{ opacity: .7 }, { opacity: 0 }], { duration: 280, easing: 'ease-out' }); }
  toast(message: string, tone: 'info' | 'error' | 'success' = 'info') {
    this.toastEl.textContent = message; this.toastEl.className = `show ${tone}`;
    clearTimeout((this.toastEl as HTMLElement & { timer?: number }).timer);
    (this.toastEl as HTMLElement & { timer?: number }).timer = window.setTimeout(() => this.toastEl.className = '', 2800);
  }
  showSaving(text = 'Saving world…') { let el = this.root.querySelector('#save-toast') as HTMLElement | null; if (!el) { el = document.createElement('div'); el.id = 'save-toast'; this.root.appendChild(el); } el.textContent = text; el.classList.add('show'); }
  hideSaving() { (this.root.querySelector('#save-toast') as HTMLElement | null)?.classList.remove('show'); }

  openInventory(view: InventoryView) {
    this.inventoryView = view; this.hideTransient(); this.inventory.classList.remove('hidden');
    this.renderInventory();
  }
  updateInventory(view: InventoryView) { this.inventoryView = view; this.renderInventory(); }
  private renderInventory() {
    const view = this.inventoryView; if (!view) return;
    this.inventory.querySelector('#inventory-title')!.textContent = view.table ? 'Crafting table' : 'Backpack';
    const grid = this.inventory.querySelector('#craft-grid')!; const size = view.craftSize; grid.className = `craft-grid size-${size}`;
    const indexes = size === 2 ? [0, 1, 2, 3] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
    grid.innerHTML = indexes.map(i => slotHtml(view.craft[i] ?? null, 'craft', i)).join('');
    const result = this.inventory.querySelector('#craft-result')!;
    result.className = `item-slot result-slot ${view.result ? '' : 'empty-result'}`;
    result.innerHTML = view.result ? `<img src="${itemIcon(view.result.id)}" alt=""><span class="item-count">${view.result.count > 1 ? view.result.count : ''}</span>` : '<span class="result-placeholder">?</span>';
    this.inventory.querySelector('#inventory-main')!.innerHTML = view.slots.slice(9, 36).map((s, i) => slotHtml(s, 'inventory', i + 9)).join('');
    this.inventory.querySelector('#inventory-hotbar')!.innerHTML = view.slots.slice(0, 9).map((s, i) => slotHtml(s, 'inventory', i)).join('');
    this.inventory.querySelector('#inventory-main')!.setAttribute('data-testid', 'inventory-grid');
    const recipeList = this.inventory.querySelector('#recipe-list')!;
    recipeList.innerHTML = view.recipes.map(r => `<button class="recipe-entry ${r.available ? 'available' : ''}" title="${esc(itemDef(r.result.id).label ?? r.result.id)}"><img src="${itemIcon(r.result.id)}" alt=""><span>${esc(itemDef(r.result.id).label ?? r.result.id)}</span>${r.result.count > 1 ? `<b>${r.result.count}</b>` : ''}</button>`).join('');
    this.inventory.querySelector('.durability-note')!.textContent = view.table ? 'Table recipes unlocked. Shift-click the result to craft as many as possible.' : 'Use a crafting table for 3×3 recipes.';
  }
  openFurnace(view: FurnaceView, slots: (Stack | null)[]) {
    this.hideTransient(); this.furnaceView = view; this.furnace.classList.remove('hidden'); this.renderFurnace(slots);
  }
  updateFurnace(view: FurnaceView, slots: (Stack | null)[]) { this.furnaceView = view; this.renderFurnace(slots); }
  private renderFurnace(slots: (Stack | null)[]) {
    const view = this.furnaceView; if (!view) return;
    for (const [name, stack] of [['input', view.input], ['fuel', view.fuel], ['output', view.output]] as const) {
      const slot = this.furnace.querySelector<HTMLElement>(`[data-furnace="${name}"]`)!;
      slot.innerHTML = stack ? slotHtml(stack, 'inventory', 999).replace('data-source="inventory"', '') : `<span class="slot-ghost">${name === 'input' ? 'ore / food' : name === 'fuel' ? 'fuel' : 'result'}</span>`;
      slot.classList.toggle('filled', !!stack);
    }
    this.furnace.querySelector<HTMLElement>('#furnace-bar')!.style.width = `${view.progress / 10 * 100}%`;
    this.furnace.querySelector<HTMLElement>('#furnace-burn')!.style.width = `${view.burnMax ? view.burn / view.burnMax * 100 : 0}%`;
    this.furnace.querySelector('#furnace-arrow')!.textContent = view.burn > 0 ? '🔥' : '→';
    const grid = this.furnace.querySelector('#furnace-inventory')!;
    grid.innerHTML = slots.slice(0, 27).map((s, i) => slotHtml(s, 'inventory', i + 9)).join('');
  }
  setHeld(stack: Stack | null, x = -100, y = -100) {
    this.heldStack = stack;
    if (!this.heldItem) return;
    this.heldItem.classList.toggle('hidden', !stack);
    if (!stack) { this.heldItem.innerHTML = ''; return; }
    this.heldItem.innerHTML = `<img src="${itemIcon(stack.id)}" alt="">${stack.count > 1 ? `<span>${stack.count}</span>` : ''}`;
    this.heldItem.style.left = `${x}px`; this.heldItem.style.top = `${y}px`;
  }
  get hasHeldItem() { return this.heldStack !== null; }
  closeContainer() { this.inventory.classList.add('hidden'); this.furnace.classList.add('hidden'); this.inventoryView = null; this.furnaceView = null; this.setHeld(null); }
  hideTransient() { this.pause.classList.add('hidden'); }

  showSettings(values?: { sensitivity: number; volume: number; renderDistance: number; muted: boolean }) {
    if (values) {
      (this.settings.querySelector('#settings-sensitivity') as HTMLInputElement).value = String(values.sensitivity);
      (this.settings.querySelector('#settings-volume') as HTMLInputElement).value = String(values.volume);
      (this.settings.querySelector('#settings-mute') as HTMLInputElement).checked = values.muted;
      (this.settings.querySelector('#settings-distance') as HTMLInputElement).value = String(values.renderDistance);
    }
    this.updateSettingLabels(); this.settings.classList.remove('hidden');
  }
  private updateSettingLabels() {
    const s = (this.settings.querySelector('#settings-sensitivity') as HTMLInputElement).value;
    const v = (this.settings.querySelector('#settings-volume') as HTMLInputElement).value;
    const d = (this.settings.querySelector('#settings-distance') as HTMLInputElement).value;
    for (const [selector, text] of [['#sensitivity-value', `${Math.round(Number(s) * 445000)}%`], ['#volume-value', `${Math.round(Number(v) * 100)}%`], ['#distance-value', `${d} chunks`]]) {
      const el = this.settings.querySelector(selector); if (el) el.textContent = text;
    }
  }
  private saveSettings() {
    this.updateSettingLabels();
    this.actions.onSettings({
      sensitivity: Number((this.settings.querySelector('#settings-sensitivity') as HTMLInputElement).value),
      volume: Number((this.settings.querySelector('#settings-volume') as HTMLInputElement).value),
      renderDistance: Number((this.settings.querySelector('#settings-distance') as HTMLInputElement).value),
      muted: (this.settings.querySelector('#settings-mute') as HTMLInputElement).checked,
    });
  }
  hideSettings() { this.settings.classList.add('hidden'); }
  closeSettingsAndResume() {
    this.hideSettings();
    if (this.actions && !this.main.classList.contains('hidden')) return;
  }
  showHelp() { this.help.classList.remove('hidden'); }
  hideHelp() { this.help.classList.add('hidden'); }
  setDebug(content: string | null) { this.debug.classList.toggle('hidden', content === null); if (content !== null) this.debug.innerHTML = content; }
}
