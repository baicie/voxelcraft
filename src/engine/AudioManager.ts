/**
 * All sound is synthesized at runtime with the Web Audio API. No copyrighted
 * audio assets are bundled.
 */
export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume = 0.65;
  private disposed = false;

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master) this.master.gain.value = this.volume;
  }

  unlock(): void {
    if (this.disposed) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.context.destination);
        this.noiseBuffer = this.createNoiseBuffer(this.context);
      }
      if (this.context.state === 'suspended') void this.context.resume();
    } catch (error) {
      console.warn('Audio unavailable', error);
    }
  }

  playBreak(hardness = 0.5): void {
    if (!this.context || !this.master || !this.noiseBuffer) return;
    const now = this.context.currentTime;
    const duration = Math.min(0.28, 0.09 + hardness * 0.12);
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 420 + Math.random() * 500;
    filter.Q.value = 0.7;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now);
    source.stop(now + duration + 0.02);

    this.playThump(110 + Math.random() * 40, 54, duration * 0.8, 0.1);
  }

  playPlace(): void {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.playThump(190 + Math.random() * 45, 90, 0.11, 0.16);
    if (!this.noiseBuffer) return;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 950;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now);
    source.stop(now + 0.08);
  }

  playStep(inWater = false): void {
    if (!this.context || !this.master || !this.noiseBuffer) return;
    const now = this.context.currentTime;
    const source = this.context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.context.createBiquadFilter();
    filter.type = inWater ? 'bandpass' : 'lowpass';
    filter.frequency.value = inWater ? 620 : 380 + Math.random() * 160;
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(inWater ? 0.055 : 0.035, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (inWater ? 0.15 : 0.08));
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now);
    source.stop(now + 0.18);
  }

  playUIClick(): void {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(520, now);
    oscillator.frequency.exponentialRampToValueAtTime(760, now + 0.045);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + 0.08);
  }

  dispose(): void {
    this.disposed = true;
    if (this.context) void this.context.close();
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
  }

  private playThump(startFrequency: number, endFrequency: number, duration: number, volume: number): void {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), now + duration);
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer {
    const length = Math.floor(context.sampleRate * 0.35);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.72 + white * 0.28;
      data[i] = last;
    }
    return buffer;
  }
}
