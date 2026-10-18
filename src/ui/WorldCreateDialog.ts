import { createButton, createElement } from './dom';

export interface WorldCreateResult {
  name: string;
  seed: string;
  mode: 'creative' | 'survival';
  difficulty: 'peaceful' | 'normal';
}

export interface WorldCreateDialogOptions {
  onCreate: (result: WorldCreateResult) => void;
  onCancel: () => void;
}

export class WorldCreateDialog {
  readonly element: HTMLElement;
  private readonly nameInput: HTMLInputElement;
  private readonly seedInput: HTMLInputElement;
  private readonly errorNode: HTMLElement;
  private readonly submitButton: HTMLButtonElement;
  private selectedMode: 'creative' | 'survival' = 'survival';
  private difficulty: 'peaceful' | 'normal' = 'peaceful';

  constructor(options: WorldCreateDialogOptions) {
    this.element = createElement('div', 'modal-layer create-world-layer');
    this.element.dataset.testid = 'create-world-dialog';
    const backdrop = createElement('div', 'modal-backdrop');
    const dialog = createElement('section', 'modal dialog create-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'create-world-title');

    const header = createElement('header', 'dialog-header');
    header.innerHTML = `
      <div>
        <span class="dialog-kicker">NEW WORLD</span>
        <h2 id="create-world-title">创建新世界</h2>
      </div>
      <span class="dialog-index">01</span>
    `;

    const form = document.createElement('form');
    form.className = 'create-form';
    form.noValidate = true;

    const modeField = createElement('div', 'field');
    modeField.innerHTML = `<span class="field-label">游戏模式 <em>GAME MODE</em></span>`;
    const modePicker = createElement('div', 'mode-picker');
    const modeOptions: Array<{ id: 'survival' | 'creative'; title: string; detail: string }> = [
      { id: 'survival', title: '生存', detail: '采集 · 合成 · 熔炼 · 铁镐成长' },
      { id: 'creative', title: '创造', detail: '无限方块 · 飞行 · 无库存消耗' },
    ];
    for (const option of modeOptions) {
      const button = createElement('button', 'mode-option');
      button.type = 'button';
      button.dataset.mode = option.id;
      button.innerHTML = `<strong>${option.title}</strong><span>${option.detail}</span>`;
      button.addEventListener('click', () => {
        this.selectedMode = option.id;
        for (const child of modePicker.querySelectorAll<HTMLElement>('.mode-option')) {
          const selected = child.dataset.mode === this.selectedMode;
          child.classList.toggle('is-selected', selected);
          child.setAttribute('aria-pressed', String(selected));
        }
      });
      button.classList.toggle('is-selected', option.id === this.selectedMode);
      button.setAttribute('aria-pressed', String(option.id === this.selectedMode));
      modePicker.append(button);
    }
    modeField.append(modePicker);

    const difficultyField = createElement('label', 'field');
    difficultyField.innerHTML = `<span class="field-label">难度 <em>DIFFICULTY</em></span>`;
    const difficultySelect = document.createElement('select');
    difficultySelect.className = 'settings-select';
    difficultySelect.dataset.testid = 'world-difficulty';
    difficultySelect.innerHTML = `
      <option value="peaceful">和平 · 专注建造与探索</option>
      <option value="normal">普通 · 为后续生存威胁预留</option>
    `;
    difficultySelect.value = this.difficulty;
    difficultySelect.addEventListener('change', () => {
      this.difficulty = difficultySelect.value === 'normal' ? 'normal' : 'peaceful';
    });
    difficultyField.append(difficultySelect);

    const nameField = createElement('label', 'field');
    nameField.innerHTML = `<span class="field-label">世界名称 <em>WORLD NAME</em></span>`;
    this.nameInput = document.createElement('input');
    this.nameInput.type = 'text';
    this.nameInput.maxLength = 32;
    this.nameInput.value = '我的世界';
    this.nameInput.autocomplete = 'off';
    this.nameInput.dataset.testid = 'world-name';
    this.nameInput.setAttribute('aria-label', '世界名称');
    nameField.append(this.nameInput);

    const seedField = createElement('label', 'field');
    seedField.innerHTML = `<span class="field-label">世界种子 <em>SEED</em></span>`;
    const seedRow = createElement('div', 'seed-row');
    this.seedInput = document.createElement('input');
    this.seedInput.type = 'text';
    this.seedInput.maxLength = 64;
    this.seedInput.placeholder = '留空则随机生成';
    this.seedInput.autocomplete = 'off';
    this.seedInput.dataset.testid = 'world-seed';
    this.seedInput.setAttribute('aria-label', '世界种子');
    const randomButton = createButton('随机', 'seed-random', 'btn-random-seed');
    randomButton.addEventListener('click', () => {
      this.seedInput.value = generateSeed();
      this.seedInput.focus();
    });
    seedRow.append(this.seedInput, randomButton);
    seedField.append(seedRow);
    const seedHint = createElement(
      'span',
      'field-hint',
      '同一字符串种子总是生成相同地形。留空时系统会创建一个随机种子。',
    );
    seedField.append(seedHint);

    this.errorNode = createElement('p', 'form-error');
    this.errorNode.setAttribute('role', 'alert');

    const actions = createElement('div', 'dialog-actions');
    const cancelButton = createButton('返回', 'menu-button menu-button-ghost dialog-cancel', 'btn-create-cancel');
    cancelButton.addEventListener('click', options.onCancel);
    this.submitButton = createButton('生成世界', 'menu-button menu-button-primary', 'btn-create-confirm');
    this.submitButton.type = 'submit';
    actions.append(cancelButton, this.submitButton);

    form.append(modeField, difficultyField, nameField, seedField, this.errorNode, actions);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = this.nameInput.value.trim();
      const seed = this.seedInput.value.trim();
      if (!name) {
        this.showError('给这个世界起一个名字。');
        this.nameInput.focus();
        return;
      }
      if (name.length > 32) {
        this.showError('世界名称不能超过 32 个字符。');
        return;
      }
      if (seed.length > 64) {
        this.showError('种子不能超过 64 个字符。');
        return;
      }
      options.onCreate({
        name,
        seed: seed || generateSeed(),
        mode: this.selectedMode,
        difficulty: this.difficulty,
      });
    });

    dialog.append(header, form);
    this.element.append(backdrop, dialog);
    backdrop.addEventListener('pointerdown', options.onCancel);
    dialog.addEventListener('pointerdown', (event) => event.stopPropagation());
    requestAnimationFrame(() => {
      this.nameInput.focus();
      this.nameInput.select();
    });
  }

  showError(message: string): void {
    this.errorNode.textContent = message;
    this.element.classList.add('has-error');
  }

  setBusy(): void {
    this.submitButton.disabled = true;
    this.submitButton.querySelector('.button-label')!.textContent = '正在生成…';
  }
}

function generateSeed(): string {
  const value = Math.floor(Math.random() * 2_147_483_647);
  return String(value);
}
