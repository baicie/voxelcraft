import type { WorldRecord } from '../persistence/WorldStorage';
import { createElement, formatSeed } from './dom';

export class LoadingScreen {
  readonly element: HTMLElement;
  private readonly progressFill: HTMLElement;
  private readonly progressValue: HTMLElement;
  private readonly statusLabel: HTMLElement;

  constructor(world: WorldRecord) {
    this.element = createElement('section', 'screen loading-screen');
    this.element.dataset.testid = 'loading-screen';
    this.element.innerHTML = `
      <div class="loading-sky" aria-hidden="true">
        <div class="loading-sun"></div>
        <div class="loading-horizon"></div>
        <div class="loading-cloud loading-cloud-a"></div>
        <div class="loading-cloud loading-cloud-b"></div>
      </div>
      <div class="loading-shell">
        <div class="loading-cube" aria-hidden="true">
          <span class="loading-cube-top"></span>
          <span class="loading-cube-left"></span>
          <span class="loading-cube-right"></span>
        </div>
        <div class="loading-copy">
          <span class="loading-kicker">GENERATING TERRAIN</span>
          <h1 class="loading-title">正在塑造世界</h1>
          <div class="loading-world">
            <strong class="loading-world-name"></strong>
            <span class="loading-world-seed"></span>
          </div>
          <div class="loading-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <div class="loading-progress-fill"></div>
          </div>
          <div class="loading-status-row">
            <span class="loading-status">准备区块数据</span>
            <span class="loading-percent">0%</span>
          </div>
          <p class="loading-tip">提示：离开世界后，位置与方块修改会自动保存在本地 IndexedDB。</p>
        </div>
      </div>
      <footer class="loading-footer">
        <span>VOXELCRAFT</span>
        <span>WORLD DATA IS STORED LOCALLY</span>
      </footer>
    `;
    this.element.querySelector<HTMLElement>('.loading-world-name')!.textContent = world.name;
    this.element.querySelector<HTMLElement>('.loading-world-seed')!.textContent = `SEED ${formatSeed(world.seed)}`;
    this.progressFill = this.element.querySelector<HTMLElement>('.loading-progress-fill')!;
    this.progressValue = this.element.querySelector<HTMLElement>('.loading-percent')!;
    this.statusLabel = this.element.querySelector<HTMLElement>('.loading-status')!;
  }

  update(progress: number, label: string): void {
    const clamped = Math.max(0, Math.min(1, progress));
    const percent = Math.round(clamped * 100);
    this.progressFill.style.width = `${percent}%`;
    this.progressValue.textContent = `${percent}%`;
    this.statusLabel.textContent = label;
    this.element.querySelector<HTMLElement>('.loading-progress')?.setAttribute('aria-valuenow', String(percent));
  }
}
