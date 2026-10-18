import type { ContainerView } from '../inventory/ContainerSession';
import type { ItemStack } from '../items/ItemStack';
import { getItemDefinition } from '../items/ItemRegistry';
import type { TextureAtlas } from '../rendering/TextureAtlas';
import { createElement } from './dom';
import { createItemIcon } from './ItemIcon';

export interface ContainerHandlers {
  onInventoryClick: (slot: number, button: 0 | 2, shift: boolean) => void;
  onCraftGridClick: (slot: number, button: 0 | 2, shift: boolean) => void;
  onCraftOutputClick: (shift: boolean) => void;
  onFurnaceClick: (slot: 'input' | 'fuel' | 'output', button: 0 | 2, shift: boolean) => void;
  onClose: () => void;
}

const INVENTORY_TITLE: Record<ContainerView['kind'], string> = {
  inventory: '背包',
  crafting_table: '工作台',
  furnace: '熔炉',
};

export class ContainerScreen {
  readonly element: HTMLElement;
  private readonly atlas: TextureAtlas;
  private readonly handlers: ContainerHandlers;
  private readonly inventoryGrid: HTMLElement;
  private readonly hotbarGrid: HTMLElement;
  private readonly craftArea: HTMLElement;
  private readonly furnaceArea: HTMLElement;
  private readonly cursor: HTMLElement;
  private view: ContainerView;

  constructor(view: ContainerView, atlas: TextureAtlas, handlers: ContainerHandlers) {
    this.view = view;
    this.atlas = atlas;
    this.handlers = handlers;
    this.element = createElement('section', 'container-screen');
    this.element.dataset.testid = 'container-screen';
    this.element.innerHTML = `
      <div class="container-backdrop"></div>
      <div class="container-panel" role="dialog" aria-modal="true" aria-label="物品容器">
        <header class="container-header">
          <div>
            <span class="dialog-kicker">SURVIVAL CONTAINER</span>
            <h2 class="container-title"></h2>
          </div>
          <button type="button" class="container-close" data-testid="btn-close-container" aria-label="关闭背包">关闭 <span class="keycap">E</span></button>
        </header>
        <div class="container-main">
          <section class="craft-area"></section>
          <section class="furnace-area" hidden></section>
          <div class="inventory-section">
            <div class="inventory-heading"><span>主背包</span><span class="inventory-capacity"></span></div>
            <div class="inventory-grid"></div>
            <div class="inventory-heading hotbar-heading"><span>快捷栏</span><span>1–9</span></div>
            <div class="hotbar-grid"></div>
          </div>
        </div>
        <footer class="container-footer">
          <span>左键拿取/交换 · 右键拆分/单个放置 · Shift 快速移动</span>
          <span>关闭时会将合成格与手持物安全放回背包</span>
        </footer>
        <div class="cursor-item" aria-hidden="true"></div>
      </div>
    `;
    this.inventoryGrid = this.element.querySelector<HTMLElement>('.inventory-grid')!;
    this.hotbarGrid = this.element.querySelector<HTMLElement>('.hotbar-grid')!;
    this.craftArea = this.element.querySelector<HTMLElement>('.craft-area')!;
    this.furnaceArea = this.element.querySelector<HTMLElement>('.furnace-area')!;
    this.cursor = this.element.querySelector<HTMLElement>('.cursor-item')!;
    this.element.querySelector<HTMLElement>('.container-title')!.textContent = INVENTORY_TITLE[view.kind];
    this.element.querySelector<HTMLElement>('[data-testid="btn-close-container"]')!.addEventListener('click', handlers.onClose);
    this.element.querySelector<HTMLElement>('.container-backdrop')!.addEventListener('pointerdown', handlers.onClose);
    this.element.addEventListener('mousemove', (event) => this.positionCursor(event));
    this.element.addEventListener('contextmenu', (event) => event.preventDefault());
    this.buildSkeleton(view);
    this.update(view);
  }

  update(view: ContainerView): void {
    this.view = view;
    this.renderInventory();
    this.renderCrafting();
    this.renderFurnace();
    this.renderCursor();
    const capacity = this.element.querySelector<HTMLElement>('.inventory-capacity');
    if (capacity) capacity.textContent = `${view.slots.filter(Boolean).length} / 36 格`;
  }

  private buildSkeleton(view: ContainerView): void {
    // Main inventory 27 slots.
    for (let index = 9; index < 36; index++) {
      this.inventoryGrid.append(this.createSlot('inventory', index));
    }
    for (let index = 0; index < 9; index++) {
      this.hotbarGrid.append(this.createSlot('inventory', index, true));
    }
    if (view.kind === 'inventory' || view.kind === 'crafting_table') {
      this.craftArea.hidden = false;
      this.furnaceArea.hidden = true;
      const gridSize = view.gridSize;
      this.craftArea.style.setProperty('--grid-size', String(gridSize));
      const heading = createElement('div', 'container-subheading');
      heading.innerHTML = `<span>${view.kind === 'inventory' ? '个人合成 2×2' : '工作台合成 3×3'}</span><span class="recipe-hint">放置材料后点击产物</span>`;
      const craftGrid = createElement('div', 'craft-grid');
      for (let index = 0; index < gridSize * gridSize; index++) {
        craftGrid.append(this.createSlot('craft', index));
      }
      const outputWrap = createElement('div', 'craft-output-wrap');
      const arrow = createElement('span', 'craft-arrow', '→');
      const output = this.createSlot('output', 0);
      output.dataset.testid = 'craft-output';
      outputWrap.append(arrow, output);
      const body = createElement('div', 'craft-body');
      body.append(craftGrid, outputWrap);
      this.craftArea.append(heading, body);
    } else {
      this.craftArea.hidden = true;
      this.furnaceArea.hidden = false;
      const heading = createElement('div', 'container-subheading');
      heading.innerHTML = '<span>熔炉</span><span class="recipe-hint">原铁 + 煤 → 铁锭</span>';
      const body = createElement('div', 'furnace-body');
      const input = this.createSlot('furnace-input', 0);
      input.dataset.testid = 'furnace-input';
      const fuel = this.createSlot('furnace-fuel', 0);
      fuel.dataset.testid = 'furnace-fuel';
      const output = this.createSlot('furnace-output', 0);
      output.dataset.testid = 'furnace-output';
      const progress = createElement('div', 'furnace-progress');
      progress.innerHTML = '<span class="furnace-flame"></span><span class="furnace-bar"><i></i></span>';
      const column = createElement('div', 'furnace-column');
      column.append(input, fuel, progress);
      const arrow = createElement('span', 'craft-arrow', '→');
      body.append(column, arrow, output);
      this.furnaceArea.append(heading, body);
    }
  }

  private createSlot(
    kind: 'inventory' | 'craft' | 'output' | 'furnace-input' | 'furnace-fuel' | 'furnace-output',
    index: number,
    hotbar = false,
  ): HTMLElement {
    const slot = createElement('button', `container-slot slot-${kind}${hotbar ? ' is-hotbar' : ''}`);
    slot.type = 'button';
    slot.dataset.kind = kind;
    slot.dataset.slot = String(index);
    if (kind === 'inventory') slot.dataset.testid = hotbar ? `hotbar-slot-${index}` : `inventory-slot-${index}`;
    if (kind === 'craft') slot.dataset.testid = `craft-slot-${index}`;
    slot.addEventListener('mousedown', (event) => {
      if (event.button !== 0 && event.button !== 2) return;
      event.preventDefault();
      event.stopPropagation();
      const button = event.button as 0 | 2;
      if (kind === 'inventory') this.handlers.onInventoryClick(index, button, event.shiftKey);
      else if (kind === 'craft') this.handlers.onCraftGridClick(index, button, event.shiftKey);
      else if (kind === 'output') this.handlers.onCraftOutputClick(event.shiftKey);
      else if (kind === 'furnace-input' || kind === 'furnace-fuel' || kind === 'furnace-output') {
        this.handlers.onFurnaceClick(kind.replace('furnace-', '') as 'input' | 'fuel' | 'output', button, event.shiftKey);
      }
    });
    return slot;
  }

  private renderInventory(): void {
    const inventorySlots = [...this.inventoryGrid.children] as HTMLElement[];
    const hotbarSlots = [...this.hotbarGrid.children] as HTMLElement[];
    for (let index = 9; index < 36; index++) {
      const slot = inventorySlots[index - 9];
      if (slot) this.fillSlot(slot, this.view.slots[index] ?? null);
    }
    for (let index = 0; index < 9; index++) {
      const slot = hotbarSlots[index];
      if (!slot) continue;
      this.fillSlot(slot, this.view.slots[index] ?? null);
      slot.classList.toggle('is-selected-hotbar', index === this.view.selectedSlot);
    }
  }

  private renderCrafting(): void {
    if (this.view.kind === 'furnace') return;
    const slots = [...this.craftArea.querySelectorAll<HTMLElement>('.slot-craft')];
    slots.forEach((slot, index) => this.fillSlot(slot, this.view.grid[index] ?? null));
    const output = this.craftArea.querySelector<HTMLElement>('.slot-output');
    if (output) {
      this.fillSlot(output, this.view.output);
      output.classList.toggle('can-craft', !!this.view.output);
      output.title = this.view.recipeId ?? '没有匹配的配方';
    }
  }

  private renderFurnace(): void {
    if (this.view.kind !== 'furnace') return;
    this.fillSlot(this.furnaceArea.querySelector<HTMLElement>('.slot-furnace-input')!, this.view.furnace?.input ?? null);
    this.fillSlot(this.furnaceArea.querySelector<HTMLElement>('.slot-furnace-fuel')!, this.view.furnace?.fuel ?? null);
    this.fillSlot(this.furnaceArea.querySelector<HTMLElement>('.slot-furnace-output')!, this.view.furnace?.output ?? null);
    const flame = this.furnaceArea.querySelector<HTMLElement>('.furnace-flame');
    const bar = this.furnaceArea.querySelector<HTMLElement>('.furnace-bar i');
    if (flame) flame.classList.toggle('is-lit', this.view.furnace?.lit ?? false);
    if (bar) bar.style.width = `${Math.round((this.view.furnace?.progress ?? 0) * 100)}%`;
  }

  private fillSlot(slot: HTMLElement, stack: ItemStack | null): void {
    slot.replaceChildren();
    slot.classList.toggle('has-item', !!stack);
    if (!stack) {
      slot.title = '';
      return;
    }
    const definition = getItemDefinition(stack.itemId);
    slot.title = `${definition?.name ?? stack.itemId}${stack.durability !== undefined ? ` · 耐久 ${stack.durability}` : ''}`;
    slot.append(createItemIcon(this.atlas, stack.itemId, 34));
    if (stack.count > 1) {
      const count = createElement('span', 'slot-count', String(stack.count));
      slot.append(count);
    }
    if (stack.durability !== undefined && definition?.maxDurability) {
      const bar = createElement('span', 'slot-durability');
      const fraction = Math.max(0, Math.min(1, stack.durability / definition.maxDurability));
      bar.style.setProperty('--durability', String(fraction));
      bar.dataset.level = fraction > 0.5 ? 'ok' : fraction > 0.2 ? 'warn' : 'bad';
      slot.append(bar);
    }
  }

  private renderCursor(): void {
    this.cursor.replaceChildren();
    if (!this.view.cursor) {
      this.cursor.classList.remove('is-visible');
      return;
    }
    this.cursor.classList.add('is-visible');
    this.cursor.append(createItemIcon(this.atlas, this.view.cursor.itemId, 40));
    if (this.view.cursor.count > 1) {
      this.cursor.append(createElement('span', 'cursor-count', String(this.view.cursor.count)));
    }
  }

  private positionCursor(event: MouseEvent): void {
    this.cursor.style.transform = `translate(${event.clientX + 14}px, ${event.clientY + 12}px)`;
  }
}

