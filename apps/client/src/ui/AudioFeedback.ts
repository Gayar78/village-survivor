import type { GameEvent, PublicGameState } from '@village-survivor/protocol';

export class AudioFeedback {
  private context: AudioContext | undefined;
  private lastEventId = 0;
  private muted = false;

  public constructor() {
    const unlock = (): void => {
      this.context ??= new AudioContext();
      void this.context.resume();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  /** Bascule la coupure du son et renvoie le nouvel état. */
  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public consume(state: PublicGameState): void {
    for (const event of state.events) {
      if (event.id <= this.lastEventId) {
        continue;
      }
      this.lastEventId = event.id;
      this.play(event);
    }
  }

  private play(event: GameEvent): void {
    if (this.muted) {
      return;
    }
    const sound = this.soundFor(event);
    const context = this.context;
    if (sound === undefined || context === undefined || context.state !== 'running') {
      return;
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = sound.type;
    oscillator.frequency.setValueAtTime(sound.frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(sound.endFrequency, now + sound.duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(sound.volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + sound.duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + sound.duration + 0.02);
  }

  private soundFor(event: GameEvent):
    | Readonly<{
        frequency: number;
        endFrequency: number;
        duration: number;
        volume: number;
        type: OscillatorType;
      }>
    | undefined {
    switch (event.type) {
      case 'enemy-hit':
        return { frequency: 180, endFrequency: 110, duration: 0.07, volume: 0.035, type: 'square' };
      case 'sword-auto-attack':
        return {
          frequency: 520,
          endFrequency: 190,
          duration: 0.09,
          volume: 0.025,
          type: 'sawtooth',
        };
      case 'enemy-killed':
        return {
          frequency: 330,
          endFrequency: 130,
          duration: 0.15,
          volume: 0.045,
          type: 'sawtooth',
        };
      case 'resource-collected':
      case 'resource-deposited':
        return { frequency: 460, endFrequency: 720, duration: 0.12, volume: 0.035, type: 'sine' };
      case 'defense-built':
      case 'heart-upgraded':
      case 'level-up':
        return { frequency: 260, endFrequency: 620, duration: 0.3, volume: 0.05, type: 'triangle' };
      case 'defense-construction-started':
        return { frequency: 150, endFrequency: 240, duration: 0.18, volume: 0.04, type: 'square' };
      case 'defense-construction-interrupted':
      case 'defense-destroyed':
        return { frequency: 180, endFrequency: 65, duration: 0.35, volume: 0.05, type: 'sawtooth' };
      case 'defense-fired':
        return { frequency: 210, endFrequency: 90, duration: 0.1, volume: 0.04, type: 'square' };
      case 'phase-changed':
        return { frequency: 125, endFrequency: 250, duration: 0.4, volume: 0.04, type: 'sine' };
      case 'player-hurt':
      case 'village-hurt':
        return { frequency: 130, endFrequency: 70, duration: 0.12, volume: 0.04, type: 'square' };
      case 'victory':
        return {
          frequency: 330,
          endFrequency: 880,
          duration: 0.65,
          volume: 0.06,
          type: 'triangle',
        };
      case 'defeat':
        return { frequency: 190, endFrequency: 55, duration: 0.7, volume: 0.055, type: 'sawtooth' };
      case 'upgrade-selected':
        return { frequency: 520, endFrequency: 760, duration: 0.16, volume: 0.04, type: 'sine' };
    }
  }
}
