import type { GameSettings } from '../persistence/SettingsStore';
import { normalizeSettings } from '../persistence/SettingsStore';
import { MAX_RENDER_DISTANCE, MIN_RENDER_DISTANCE } from '../world/constants';
import { createButton, createElement } from './dom';

export interface SettingsPanelOptions {
  settings: GameSettings;
  onChange: (settings: GameSettings) => void;
  onClose: () => void;
}

interface RangeBinding {
  input: HTMLInputElement;
  output: HTMLOutputElement;
  format: (value: number) => string;
}

export class SettingsPanel {
  readonly element: HTMLElement;
  private current: GameSettings;
  private readonly onChange: (settings: GameSettings) => void;
  private readonly ranges: RangeBinding[] = [];
  private debugToggle: HTMLInputElement;

  constructor(options: SettingsPanelOptions) {
    this.current = { ...options.settings };
    this.onChange = options.onChange;
    this.element = createElement('div', 'modal-layer settings-layer');
    this.element.dataset.testid = 'settings-panel';
    const backdrop = createElement('div', 'modal-backdrop');
    const dialog = createElement('section', 'modal dialog settings-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'settings-title');

    const header = createElement('header', 'dialog-header');
    header.innerHTML = `
      <div>
        <span class="dialog-kicker">OPTIONS</span>
        <h2 id="settings-title">设置</h2>
      </div>
      <span class="dialog-index">03</span>
    `;

    const fields = createElement('div', 'settings-fields');
    this.addRange(fields, {
      label: '渲染距离',
      hint: '更高的视距会加载更多区块，也更消耗性能。',
      min: MIN_RENDER_DISTANCE,
      max: MAX_RENDER_DISTANCE,
      step: 1,
      value: this.current.renderDistance,
      format: (value) => `${value} 区块`,
      testId: 'setting-render-distance',
      apply: (value) => {
        this.current.renderDistance = value;
      },
    });
    this.addRange(fields, {
      label: '鼠标灵敏度',
      hint: '调整第一人称视角的转动速度。',
      min: 0.3,
      max: 2.5,
      step: 0.05,
      value: this.current.sensitivity,
      format: (value) => `${value.toFixed(2)}×`,
      testId: 'setting-sensitivity',
      apply: (value) => {
        this.current.sensitivity = value;
      },
    });
    this.addRange(fields, {
      label: '视野 FOV',
      hint: '冲刺时视野会自动略微扩张。',
      min: 60,
      max: 100,
      step: 1,
      value: this.current.fov,
      format: (value) => `${Math.round(value)}°`,
      testId: 'setting-fov',
      apply: (value) => {
        this.current.fov = value;
      },
    });
    this.addRange(fields, {
      label: '音量',
      hint: '环境音效由程序实时合成。',
      min: 0,
      max: 1,
      step: 0.05,
      value: this.current.volume,
      format: (value) => `${Math.round(value * 100)}%`,
      testId: 'setting-volume',
      apply: (value) => {
        this.current.volume = value;
      },
    });

    const debugField = createElement('label', 'toggle-field');
    debugField.innerHTML = `
      <span class="toggle-copy">
        <span class="field-label">显示调试信息</span>
        <span class="field-hint">FPS、坐标、区块与网格统计。</span>
      </span>
    `;
    this.debugToggle = document.createElement('input');
    this.debugToggle.type = 'checkbox';
    this.debugToggle.checked = this.current.showDebug;
    this.debugToggle.dataset.testid = 'setting-debug';
    this.debugToggle.addEventListener('change', () => {
      this.current.showDebug = this.debugToggle.checked;
      this.apply();
    });
    debugField.append(this.debugToggle);
    fields.append(debugField);

    const actions = createElement('div', 'dialog-actions settings-actions');
    const reset = createButton('恢复默认', 'menu-button menu-button-ghost', 'btn-settings-reset');
    reset.addEventListener('click', () => {
      this.current = normalizeSettings({});
      for (const range of this.ranges) {
        const value = this.readCurrentValue(range.input.dataset.testid);
        range.input.value = String(value);
        range.output.textContent = range.format(value);
      }
      this.debugToggle.checked = this.current.showDebug;
      this.apply();
    });
    const done = createButton('完成', 'menu-button menu-button-primary', 'btn-settings-close');
    done.addEventListener('click', options.onClose);
    actions.append(reset, done);

    dialog.append(header, fields, actions);
    this.element.append(backdrop, dialog);
    backdrop.addEventListener('pointerdown', options.onClose);
    dialog.addEventListener('pointerdown', (event) => event.stopPropagation());
    this.element.addEventListener('keydown', (event) => {
      if (event.code === 'Escape') {
        event.stopPropagation();
        options.onClose();
      }
    });
    requestAnimationFrame(() => done.focus());
  }

  private readCurrentValue(testId: string | undefined): number {
    switch (testId) {
      case 'setting-render-distance':
        return this.current.renderDistance;
      case 'setting-sensitivity':
        return this.current.sensitivity;
      case 'setting-fov':
        return this.current.fov;
      case 'setting-volume':
        return this.current.volume;
      default:
        return 0;
    }
  }

  private addRange(
    root: HTMLElement,
    options: {
      label: string;
      hint: string;
      min: number;
      max: number;
      step: number;
      value: number;
      format: (value: number) => string;
      testId: string;
      apply: (value: number) => void;
    },
  ): void {
    const label = createElement('label', 'field range-field');
    const head = createElement('span', 'range-head');
    const title = createElement('span', 'field-label', options.label);
    const output = createElement('output', 'range-output', options.format(options.value));
    head.append(title, output);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(options.min);
    input.max = String(options.max);
    input.step = String(options.step);
    input.value = String(options.value);
    input.dataset.testid = options.testId;
    input.setAttribute('aria-label', options.label);
    input.addEventListener('input', () => {
      const numeric = Number(input.value);
      options.apply(numeric);
      output.textContent = options.format(numeric);
      this.apply();
    });
    label.append(head, input, createElement('span', 'field-hint', options.hint));
    root.append(label);
    this.ranges.push({ input, output, format: options.format });
  }

  private apply(): void {
    this.current = normalizeSettings(this.current);
    this.onChange({ ...this.current });
  }
}
