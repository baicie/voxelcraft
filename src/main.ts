import './style.css';
import { GameApp } from './app/GameApp';

const uiRoot = document.querySelector<HTMLElement>('#ui-root');

if (!uiRoot) {
  throw new Error('VoxelCraft root element is missing');
}

const app = new GameApp(uiRoot);
void app.init().catch((error: unknown) => {
  console.error('Fatal VoxelCraft error', error);
  const message = error instanceof Error ? error.message : String(error);
  uiRoot.innerHTML = '';
  const layer = document.createElement('div');
  layer.className = 'modal-layer fatal-layer';
  layer.innerHTML = `
    <div class="modal-backdrop"></div>
    <section class="modal dialog fatal-dialog">
      <span class="dialog-kicker">SYSTEM MESSAGE</span>
      <h2>启动失败</h2>
      <p></p>
      <button type="button" class="menu-button menu-button-primary">重新加载</button>
    </section>
  `;
  layer.querySelector('p')!.textContent = message;
  layer.querySelector('button')!.addEventListener('click', () => window.location.reload());
  uiRoot.append(layer);
});
