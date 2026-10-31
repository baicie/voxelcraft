export type SoundName = 'step'|'jump'|'land'|'mine'|'break'|'place'|'pickup'|'craft'|'hurt'|'mobHurt'|'mobDeath'|'eat'|'click'|'splash'|'furnace';
export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastStep = 0;
  volume = .55;
  muted = false;

  async unlock(): Promise<void> {
    if (!this.context) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.context = new Ctx();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.context.destination);
      const frames = this.context.sampleRate;
      this.noise = this.context.createBuffer(1, frames, this.context.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }
  setVolume(value: number) { this.volume = Math.max(0, Math.min(1, value)); if (this.master) this.master.gain.value = this.muted ? 0 : this.volume; }
  setMuted(value: boolean) { this.muted = value; if (this.master) this.master.gain.value = value ? 0 : this.volume; }
  private tone(frequency: number, duration: number, type: OscillatorType, gain = .12, slide = 0) {
    if (!this.context || !this.master || this.muted) return;
    const osc = this.context.createOscillator();
    const envelope = this.context.createGain();
    const now = this.context.currentTime;
    osc.type = type; osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), now + duration);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(gain, now + .012);
    envelope.gain.exponentialRampToValueAtTime(.0001, now + duration);
    osc.connect(envelope); envelope.connect(this.master); osc.start(now); osc.stop(now + duration + .02);
  }
  private noiseBurst(duration: number, gain: number, lowpass: number, highpass = 70) {
    if (!this.context || !this.master || !this.noise) return;
    const source = this.context.createBufferSource(); source.buffer = this.noise;
    const filter = this.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = lowpass;
    const hp = this.context.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = highpass;
    const env = this.context.createGain(); const now = this.context.currentTime;
    env.gain.setValueAtTime(gain, now); env.gain.exponentialRampToValueAtTime(.0001, now + duration);
    source.connect(hp); hp.connect(filter); filter.connect(env); env.connect(this.master);
    source.start(now); source.stop(now + duration);
  }
  play(name: SoundName) {
    if (!this.context) return;
    switch (name) {
      case 'step': if (performance.now() - this.lastStep < 210) return; this.lastStep = performance.now(); this.noiseBurst(.07, .035, 600, 130); break;
      case 'jump': this.tone(150, .12, 'sine', .04, 40); break;
      case 'land': this.noiseBurst(.14, .12, 420, 50); break;
      case 'mine': this.noiseBurst(.06, .055, 2100, 400); break;
      case 'break': this.noiseBurst(.2, .18, 1000, 100); this.tone(100, .12, 'square', .035, -35); break;
      case 'place': this.noiseBurst(.09, .12, 800, 100); this.tone(190, .08, 'triangle', .035, -30); break;
      case 'pickup': this.tone(660, .07, 'sine', .055, 240); break;
      case 'craft': this.tone(440, .1, 'triangle', .07, 80); setTimeout(() => this.tone(660, .12, 'triangle', .055, 120), 75); break;
      case 'hurt': this.tone(120, .2, 'sawtooth', .08, -50); this.noiseBurst(.12, .1, 500, 80); break;
      case 'mobHurt': this.tone(180, .1, 'square', .04, -55); break;
      case 'mobDeath': this.tone(150, .28, 'sawtooth', .045, -90); break;
      case 'eat': this.noiseBurst(.07, .06, 1000, 200); break;
      case 'click': this.tone(480, .045, 'square', .025, 30); break;
      case 'splash': this.noiseBurst(.3, .16, 1400, 200); break;
      case 'furnace': this.noiseBurst(.35, .025, 500, 90); break;
    }
  }
  dispose() { void this.context?.close(); this.context = null; this.master = null; }
}
