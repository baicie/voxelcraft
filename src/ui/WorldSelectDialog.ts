import type { WorldRecord } from '../persistence/WorldStorage';
import { createButton, createElement, formatSeed, formatWorldDate } from './dom';

export interface WorldSelectDialogOptions {
  worlds: WorldRecord[];
  onSelect: (world: WorldRecord) => void;
  onCancel: () => void;
}

export class WorldSelectDialog {
  readonly element: HTMLElement;

  constructor(options: WorldSelectDialogOptions) {
    this.element = createElement('div', 'modal-layer world-select-layer');
    this.element.dataset.testid = 'world-select-dialog';
    const backdrop = createElement('div', 'modal-backdrop');
    const dialog = createElement('section', 'modal dialog world-select-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    const header = createElement('header', 'dialog-header');
    header.innerHTML = `
      <div>
        <span class="dialog-kicker">SAVED WORLDS</span>
        <h2>选择世界</h2>
      </div>
      <span class="dialog-index">${String(options.worlds.length).padStart(2, '0')}</span>
    `;

    const list = createElement('div', 'world-list');
    if (options.worlds.length === 0) {
      list.append(createElement('p', 'empty-state', '还没有保存的世界。'));
    }
    for (const world of options.worlds) {
      const card = createElement('button', 'world-card');
      card.type = 'button';
      card.dataset.worldId = world.id;
      const details = createElement('div', 'world-card-copy');
      details.append(
        createElement('strong', 'world-card-name', world.name),
        createElement(
          'span',
          'world-card-meta',
          `${world.mode === 'survival' ? '生存' : '创造'} · ${world.generatorVersion >= 2 ? 'V2 地形' : 'V1 地形'} · SEED ${formatSeed(world.seed)} · ${formatWorldDate(world.lastPlayed)}`,
        ),
      );
      const player = world.player;
      const location = createElement(
        'span',
        'world-card-location',
        player ? `X ${Math.round(player.x)} · Y ${Math.round(player.y)} · Z ${Math.round(player.z)}` : '尚未进入',
      );
      const enter = createElement('span', 'world-card-enter', '进入');
      card.append(details, location, enter);
      card.addEventListener('click', () => options.onSelect(world));
      list.append(card);
    }

    const actions = createElement('div', 'dialog-actions');
    const close = createButton('返回主菜单', 'menu-button menu-button-ghost', 'btn-world-select-close');
    close.addEventListener('click', options.onCancel);
    actions.append(close);

    dialog.append(header, list, actions);
    this.element.append(backdrop, dialog);
    backdrop.addEventListener('pointerdown', options.onCancel);
    dialog.addEventListener('pointerdown', (event) => event.stopPropagation());
  }
}
