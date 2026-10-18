export function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function createButton(
  label: string,
  className: string,
  testId?: string,
  detail?: string,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  if (testId) button.dataset.testid = testId;
  const labelNode = createElement('span', 'button-label', label);
  button.append(labelNode);
  if (detail) button.append(createElement('span', 'button-detail', detail));
  return button;
}

export function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
}

export function formatWorldDate(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return '未知';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export function formatClock(timeOfDay: number): string {
  const normalized = ((timeOfDay % 1) + 1) % 1;
  const totalMinutes = Math.floor(normalized * 24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function formatSeed(seed: string): string {
  return seed.length > 18 ? `${seed.slice(0, 18)}…` : seed;
}
