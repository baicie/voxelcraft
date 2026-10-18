import type { WorldRecord } from '../persistence/WorldStorage';
import { createButton, createElement, formatSeed, formatWorldDate } from './dom';

export interface MainMenuOptions {
  worlds: WorldRecord[];
  onContinue: (world: WorldRecord) => void;
  onCreate: () => void;
  onWorlds: () => void;
  onSettings: () => void;
}

export class MainMenu {
  readonly element: HTMLElement;

  constructor(options: MainMenuOptions) {
    const latest = options.worlds[0] ?? null;
    this.element = createElement('section', 'screen menu-screen');
    this.element.dataset.testid = 'main-menu';

    const sky = createElement('div', 'menu-sky');
    sky.setAttribute('aria-hidden', 'true');
    sky.innerHTML = `
      <div class="menu-sun"></div>
      <div class="menu-cloud menu-cloud-a"></div>
      <div class="menu-cloud menu-cloud-b"></div>
      <div class="menu-ridge menu-ridge-far"></div>
      <div class="menu-ridge menu-ridge-near"></div>
      <div class="menu-grid"></div>
    `;

    const topbar = createElement('header', 'menu-topbar');
    const brand = createElement('div', 'menu-brand');
    brand.innerHTML = '<span class="brand-mark"></span><span>VOXELCRAFT</span><span class="brand-slash">//</span><span class="brand-muted">SANDBOX</span>';
    const build = createElement('span', 'menu-build', 'BUILD 0.1 · THREE.JS');
    topbar.append(brand, build);

    const layout = createElement('div', 'menu-layout');
    const hero = createElement('div', 'menu-hero');
    const eyebrow = createElement('p', 'eyebrow', 'PROCEDURAL VOXEL WORLD');
    const title = createElement('h1', 'game-logo');
    title.innerHTML = '<span class="logo-line logo-line-a">VOXEL</span><span class="logo-line logo-line-b">CRAFT</span>';
    const description = createElement(
      'p',
      'hero-copy',
      '探索由种子生长的土地，凿开山体，建造属于你的世界。每一次进入，都从一片未被触碰的地形开始。',
    );
    const cubeStage = createElement('div', 'cube-stage');
    cubeStage.setAttribute('aria-hidden', 'true');
    cubeStage.innerHTML = `
      <div class="hero-cube">
        <div class="cube-face cube-top"></div>
        <div class="cube-face cube-left"></div>
        <div class="cube-face cube-right"></div>
      </div>
      <div class="cube-shadow"></div>
      <div class="cube-caption"><span>WORLD SEED</span><strong>INFINITE</strong></div>
    `;
    const featureRow = createElement('div', 'menu-features');
    featureRow.innerHTML = `
      <span><i class="feature-dot"></i>确定性地形</span>
      <span><i class="feature-dot"></i>无限区块</span>
      <span><i class="feature-dot"></i>本地存档</span>
    `;
    hero.append(eyebrow, title, description, cubeStage, featureRow);

    const panel = createElement('div', 'menu-panel');
    const panelTop = createElement('div', 'panel-heading');
    panelTop.innerHTML = '<span class="panel-kicker">WORLD ACCESS</span><span class="panel-rule"></span><span class="panel-count"></span>';
    const count = panelTop.querySelector<HTMLElement>('.panel-count');
    if (count) count.textContent = `${options.worlds.length} 个存档`;
    const latestCard = createElement('div', `latest-world ${latest ? '' : 'is-empty'}`);
    if (latest) {
      latestCard.innerHTML = `
        <span class="latest-label">最近游玩</span>
        <strong class="latest-name"></strong>
        <span class="latest-meta"></span>
      `;
      latestCard.querySelector<HTMLElement>('.latest-name')!.textContent = latest.name;
      latestCard.querySelector<HTMLElement>('.latest-meta')!.textContent =
        `${latest.mode === 'survival' ? '生存' : '创造'} · ${latest.generatorVersion >= 2 ? 'V2 地形' : 'V1 地形'} · SEED ${formatSeed(latest.seed)} · ${formatWorldDate(latest.lastPlayed)}`;
    } else {
      latestCard.innerHTML = `
        <span class="latest-label">还没有世界</span>
        <strong class="latest-name">从一粒种子开始</strong>
        <span class="latest-meta">创建世界，地形与树木会按种子确定生成</span>
      `;
    }

    const actions = createElement('div', 'menu-actions');
    const continueButton = createButton(
      '继续游戏',
      'menu-button menu-button-primary',
      'btn-continue',
      latest ? latest.name : '暂无存档',
    );
    continueButton.disabled = !latest;
    continueButton.addEventListener('click', () => {
      if (latest) options.onContinue(latest);
    });

    const createButtonElement = createButton(
      '创建新世界',
      'menu-button menu-button-secondary',
      'btn-create',
      '设定名称与种子',
    );
    createButtonElement.addEventListener('click', options.onCreate);

    const worldsButton = createButton('世界列表', 'menu-button menu-button-ghost', 'btn-worlds', `${options.worlds.length} 个世界`);
    worldsButton.disabled = options.worlds.length === 0;
    worldsButton.addEventListener('click', options.onWorlds);

    const settingsButton = createButton('设置', 'menu-button menu-button-ghost', 'btn-settings', '视距 · 灵敏度 · 音量');
    settingsButton.addEventListener('click', options.onSettings);

    actions.append(continueButton, createButtonElement, worldsButton, settingsButton);
    const controlsNote = createElement('div', 'menu-controls-note');
    controlsNote.innerHTML = `
      <span class="keycap">WASD</span> 移动
      <span class="keycap">SPACE</span> 跳跃
      <span class="keycap">LMB</span> 挖掘
      <span class="keycap">RMB</span> 放置
    `;
    panel.append(panelTop, latestCard, actions, controlsNote);

    const footer = createElement('footer', 'menu-footer');
    footer.innerHTML = `
      <span>原创程序化纹理 · 无外部游戏素材</span>
      <span>单击进入后使用鼠标观察 · ESC 暂停</span>
    `;

    const layoutWrap = createElement('div', 'menu-layout-wrap');
    layoutWrap.append(hero, layout);
    layout.append(panel);
    this.element.append(sky, topbar, layoutWrap, footer);
  }
}
