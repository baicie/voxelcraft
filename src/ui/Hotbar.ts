import type { HotbarState } from '../app/GameEvents';
import { getItemDefinition } from '../items/ItemRegistry';
import type { ItemStack } from '../items/ItemStack';
import type { TextureAtlas } from '../rendering/TextureAtlas';
import { createElement } from './dom';
import { createItemIcon } from './ItemIcon';

interface SlotVisual {
  slot: HTMLElement;
  icon: HTMLElement;
  count: HTMLElement;
  durability: HTMLElement;
}

export class Hotbar {
  readonly element: HTMLElement;
  private readonly slots: SlotVisual[] = [];
  private readonly label: HTMLElement;
  private readonly atlas: TextureAtlas;
  private selectedIndex = 0;

  constructor(atlas: TextureAtlas, state: HotbarState) {
    this.atlas = atlas;
    this.element = createElement('div', 'hotbar');
    this.element.dataset.testid = 'hotbar';
    this.label = createElement('div', 'hotbar-selected-label');
    const tray = createElement('div', 'hotbar-tray');
    for (let index = 0; index < 9; index++) {
      const slot = createElement('div', 'hotbar-slot');
      slot.dataset.slot = String(index);
      slot.setAttribute('role', 'listitem');
      const icon = createElement('div', 'hotbar-icon');
      const number = createElement('span', 'hotbar-number', String(index + 1));
      const count = createElement('span', 'hotbar-count');
      const durability = createElement('span', 'hotbar-durability');
      slot.append(icon, number, count, durability);
      tray.append(slot);
      this.slots.push({ slot, icon, count, durability });
    }
    this.element.append(this.label, tray);
    this.setState(state);
  }

  setState(state: HotbarState): void {
    this.currentState = state;
    this.selectedIndex = state.selectedIndex;
    state.slots.forEach((stack, index) => {
      const visual = this.slots[index];
      if (!visual) return;
      visual.icon.replaceChildren();
      visual.count.textContent = '';
      visual.durability.style.display = 'none';
      if (stack) {
        visual.icon.append(createItemIcon(this.atlas, stack.itemId, 36));
        visual.count.textContent = stack.count > 1 ? String(stack.count) : '';
        visual.count.classList.toggle('is-infinite', state.mode === 'creative' && stack.count <= 1);
        this.applyDurability(visual, stack);
      }
      const definition = stack ? getItemDefinition(stack.itemId) : undefined;
      visual.slot.title = definition?.name ?? '空槽';
    });
    this.updateSelected();
  }

  setSelected(index: number): void {
    this.selectedIndex = index;
    this.updateSelected();
  }

  dispose(): void {
    this.element.remove();
  }

  private updateSelected(): void {
    this.slots.forEach((visual, index) => {
      visual.slot.classList.toggle('is-selected', index === this.selectedIndex);
    });
    const stack = this.currentStack;
    const definition = stack ? getItemDefinition(stack.itemId) : undefined;
    const text = definition?.name ?? '';
    this.label.textContent = text;
    this.label.classList.toggle('is-visible', text.length > 0);
  }

  private stackAt(index: number): ItemStack | null {
    return this.currentState?.slots[index] ?? null;
  }

  private currentState: HotbarState | null = null;

  private get currentStack(): ItemStack | null {
    return this.stackAt(this.selectedIndex);
  }

  private applyDurability(visual: SlotVisual, stack: ItemStack): void {
    const definition = getItemDefinition(stack.itemId);
    if (!definition?.maxDurability || stack.durability === undefined) return;
    const fraction = Math.max(0, Math.min(1, stack.durability / definition.maxDurability));
    visual.durability.style.display = 'block';
    visual.durability.style.setProperty('--durability', String(fraction));
    visual.durability.dataset.level = fraction > 0.5 ? 'ok' : fraction > 0.2 ? 'warn' : 'bad';
  }
}
