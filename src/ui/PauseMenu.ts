import type { WorldRecord } from '../persistence/WorldStorage';
import { createButton, createElement, formatSeed } from './dom';

export interface PauseMenuOptions {
  world: WorldRecord;
  onResume: () => void;
  onSave: () => void;
  onSettings: () => void;
  onQuit: () => void;
}

export class PauseMenu {
  readonly element: HTMLElement;
  private readonly saveButton: HTMLButtonElement;
  private readonly quitButton: HTMLButtonElement;

  constructor(options: PauseMenuOptions) {
    this.element = createElement('div', 'pause-layer');
    this.element.dataset.testid = 'pause-menu';
    this.element.innerHTML = `
      <div class="pause-backdrop"></div>
      <section class="pause-panel" role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <header class="pause-header">
          <span class="dialog-kicker">PAUSED</span>
          <h2 id="pause-title">游戏已暂停</h2>
          <p class="pause-world"></p>
          <span class="pause-seed"></span>
        </header>
        <div class="pause-divider"><span></span></div>
        <div class="pause-actions"></div>
        <div class="pause-note">
          <span class="pause-note-icon"></span>
          世界会自动保存。按 <span class="keycap">ESC</span> 或点击“继续游戏”返回。
        </div>
      </section>
    `;
    this.element.querySelector<HTMLElement>('.pause-world')!.textContent = options.world.name;
    this.element.querySelector<HTMLElement>('.pause-seed')!.textContent = `SEED ${formatSeed(options.world.seed)}`;

    const actions = this.element.querySelector<HTMLElement>('.pause-actions')!;
    const resume = createButton('继续游戏', 'menu-button menu-button-primary pause-resume', 'btn-resume', '返回第一人称视角');
    resume.addEventListener('click', options.onResume);
    const save = createButton('保存进度', 'menu-button menu-button-ghost', 'btn-save', '写入当前位置与方块修改');
    save.addEventListener('click', options.onSave);
    const settings = createButton('设置', 'menu-button menu-button-ghost', 'btn-pause-settings', '视距 · 灵敏度 · 音量');
    settings.addEventListener('click', options.onSettings);
    const quit = createButton('保存并退出', 'menu-button menu-button-danger', 'btn-quit', '返回主菜单');
    quit.addEventListener('click', options.onQuit);
    actions.append(resume, save, settings, quit);
    this.saveButton = save;
    this.quitButton = quit;
    requestAnimationFrame(() => resume.focus());
  }

  setBusy(label = '正在保存…'): void {
    this.saveButton.disabled = true;
    this.quitButton.disabled = true;
    this.saveButton.querySelector('.button-label')!.textContent = label;
    this.quitButton.querySelector('.button-label')!.textContent = label;
  }

  setIdle(): void {
    this.saveButton.disabled = false;
    this.quitButton.disabled = false;
    this.saveButton.querySelector('.button-label')!.textContent = '保存进度';
    this.quitButton.querySelector('.button-label')!.textContent = '保存并退出';
  }
}
