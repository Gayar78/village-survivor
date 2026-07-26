import type { GamePhase } from '@village-survivor/protocol';

export type PhaseVisuals = Readonly<{
  ground: number;
  grid: number;
  gridAlpha: number;
  shadowAlpha: number;
  outline: number;
}>;

/**
 * Durée pendant laquelle la phase suivante est anticipée visuellement. La nuit
 * tombe donc progressivement avant que la simulation ne bascule réellement.
 */
export const PHASE_TRANSITION_MS = 9_000;

const PHASE_VISUALS: Readonly<Record<GamePhase, PhaseVisuals>> = {
  day: {
    ground: 0xe9ede5,
    grid: 0xc5cec5,
    gridAlpha: 0.8,
    shadowAlpha: 0.27,
    outline: 0x165a6d,
  },
  night: {
    ground: 0x111725,
    grid: 0x29413e,
    gridAlpha: 0.28,
    shadowAlpha: 0.16,
    outline: 0xeafcff,
  },
  final: {
    ground: 0x2a1722,
    grid: 0x4a2333,
    gridAlpha: 0.32,
    shadowAlpha: 0.16,
    outline: 0xffe3ec,
  },
};

/**
 * La phase finale est déclenchée par une action du joueur et non par la fin d'un
 * compte à rebours : elle ne peut pas être anticipée, et sa rupture visuelle est
 * assumée comme un effet dramatique.
 */
const NEXT_PHASE: Readonly<Record<GamePhase, GamePhase>> = {
  day: 'night',
  night: 'day',
  final: 'final',
};

function lerp(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio;
}

export function lerpColor(from: number, to: number, ratio: number): number {
  const clamped = Math.max(0, Math.min(1, ratio));
  const red = Math.round(lerp((from >> 16) & 0xff, (to >> 16) & 0xff, clamped));
  const green = Math.round(lerp((from >> 8) & 0xff, (to >> 8) & 0xff, clamped));
  const blue = Math.round(lerp(from & 0xff, to & 0xff, clamped));
  return (red << 16) | (green << 8) | blue;
}

export function resolvePhaseVisuals(phase: GamePhase, phaseRemainingMs: number): PhaseVisuals {
  const current = PHASE_VISUALS[phase];
  if (phase === 'final' || phaseRemainingMs >= PHASE_TRANSITION_MS) {
    return current;
  }
  const next = PHASE_VISUALS[NEXT_PHASE[phase]];
  const ratio = 1 - Math.max(0, phaseRemainingMs) / PHASE_TRANSITION_MS;
  return {
    ground: lerpColor(current.ground, next.ground, ratio),
    grid: lerpColor(current.grid, next.grid, ratio),
    gridAlpha: lerp(current.gridAlpha, next.gridAlpha, ratio),
    shadowAlpha: lerp(current.shadowAlpha, next.shadowAlpha, ratio),
    outline: lerpColor(current.outline, next.outline, ratio),
  };
}
