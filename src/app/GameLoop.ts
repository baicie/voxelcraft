export type FrameCallback = (deltaSeconds: number, nowMs: number) => void;

export class GameLoop {
  private readonly callback: FrameCallback;
  private frameHandle = 0;
  private running = false;
  private previousTime = 0;

  constructor(callback: FrameCallback) {
    this.callback = callback;
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.previousTime = performance.now();
    this.frameHandle = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    const delta = Math.min(0.05, Math.max(0, (now - this.previousTime) / 1000));
    this.previousTime = now;
    this.callback(delta, now);
    if (!this.running) return;
    this.frameHandle = requestAnimationFrame(this.tick);
  };
}
