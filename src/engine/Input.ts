export interface MouseDelta {
  x: number;
  y: number;
}

const GAME_KEYS = new Set([
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyF',
  'Space',
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Escape',
]);

export class Input {
  readonly canvas: HTMLCanvasElement;
  onPointerLockChanged: ((locked: boolean) => void) | null = null;
  onKeyPressed: ((code: string) => void) | null = null;

  private readonly keysDown = new Set<string>();
  private readonly keysPressed = new Set<string>();
  private readonly mouseDown = new Set<number>();
  private readonly mousePressed = new Set<number>();
  private mouseDeltaX = 0;
  private mouseDeltaY = 0;
  private wheel = 0;
  private locked = false;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    document.addEventListener('pointerlockerror', this.handlePointerLockError);
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mousedown', this.handleMouseDown);
    document.addEventListener('mouseup', this.handleMouseUp);
    document.addEventListener('wheel', this.handleWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.handleContextMenu);
  }

  get isLocked(): boolean {
    return this.locked;
  }

  isDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  isActionDown(action: 'forward' | 'back' | 'left' | 'right' | 'jump' | 'sneak' | 'sprint' | 'fly'): boolean {
    switch (action) {
      case 'forward':
        return this.isDown('KeyW');
      case 'back':
        return this.isDown('KeyS');
      case 'left':
        return this.isDown('KeyA');
      case 'right':
        return this.isDown('KeyD');
      case 'jump':
        return this.isDown('Space');
      case 'sneak':
        return this.isDown('ShiftLeft') || this.isDown('ShiftRight');
      case 'sprint':
        return this.isDown('ControlLeft') || this.isDown('ControlRight');
      case 'fly':
        return this.wasPressed('KeyF');
    }
  }

  wasPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  isMouseDown(button: number): boolean {
    return this.mouseDown.has(button);
  }

  wasMousePressed(button: number): boolean {
    return this.mousePressed.has(button);
  }

  consumeMouseDelta(): MouseDelta {
    const delta = { x: this.mouseDeltaX, y: this.mouseDeltaY };
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    return delta;
  }

  consumeWheel(): number {
    const value = this.wheel;
    this.wheel = 0;
    return value;
  }

  endFrame(): void {
    this.keysPressed.clear();
    this.mousePressed.clear();
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.wheel = 0;
  }

  clearTransient(): void {
    this.keysDown.clear();
    this.keysPressed.clear();
    this.mouseDown.clear();
    this.mousePressed.clear();
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.wheel = 0;
  }

  async requestPointerLock(): Promise<void> {
    if (document.pointerLockElement === this.canvas) return;
    try {
      const result = this.canvas.requestPointerLock();
      if (result instanceof Promise) await result;
    } catch (error) {
      console.warn('Pointer lock request failed', error);
      throw error;
    }
  }

  exitPointerLock(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    document.removeEventListener('pointerlockerror', this.handlePointerLockError);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mousedown', this.handleMouseDown);
    document.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('wheel', this.handleWheel);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    this.clearTransient();
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target.isContentEditable
    );
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.locked || this.isEditableTarget(event.target)) return;
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    if (!this.keysDown.has(event.code)) {
      this.keysPressed.add(event.code);
      this.onKeyPressed?.(event.code);
    }
    this.keysDown.add(event.code);
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.keysDown.delete(event.code);
  };

  private handleBlur = (): void => {
    this.clearTransient();
  };

  private handlePointerLockChange = (): void => {
    const locked = document.pointerLockElement === this.canvas;
    if (locked === this.locked) return;
    this.locked = locked;
    if (!locked) {
      this.clearTransient();
    }
    this.onPointerLockChanged?.(locked);
  };

  private handlePointerLockError = (): void => {
    this.locked = false;
    this.clearTransient();
    this.onPointerLockChanged?.(false);
  };

  private handleMouseMove = (event: MouseEvent): void => {
    if (!this.locked) return;
    this.mouseDeltaX += event.movementX;
    this.mouseDeltaY += event.movementY;
  };

  private handleMouseDown = (event: MouseEvent): void => {
    if (!this.locked) return;
    if (event.button === 0 || event.button === 2) event.preventDefault();
    if (!this.mouseDown.has(event.button)) this.mousePressed.add(event.button);
    this.mouseDown.add(event.button);
  };

  private handleMouseUp = (event: MouseEvent): void => {
    this.mouseDown.delete(event.button);
  };

  private handleWheel = (event: WheelEvent): void => {
    if (!this.locked) return;
    event.preventDefault();
    this.wheel += Math.sign(event.deltaY);
  };

  private handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };
}
