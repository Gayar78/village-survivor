import { SpanStatusCode, type Attributes, type Span } from '@opentelemetry/api';
import type { Histogram, UpDownCounter, Counter } from '@opentelemetry/api';

import { hashRoomCode } from './redact.js';
import { getMeter, getTracer, telemetryConfig } from './telemetry.js';

/**
 * Instruments et spans propres au jeu.
 *
 * Ce module tient la liste **fermée** de ce qui est mesuré et de ce qui est émis. Les noms
 * suivent la spécification d'observabilité ; les attributs y sont limités à ce qui sert au
 * diagnostic ou à l'extrapolation. Aucun identifiant de joueur n'apparaît nulle part : le retrait
 * des mesures d'usage a supprimé le seul besoin qui le justifiait.
 */

export type GameMode = 'solo' | 'coop';

/**
 * Seaux de population.
 *
 * Une métrique porte un attribut par valeur distincte : émettre le nombre exact de monstres
 * créerait des centaines de séries pour une information qu'on ne lit qu'en ordre de grandeur.
 * Quatre seaux suffisent à relier le coût d'un tick à la charge qui le produit.
 */
export function monstersBucket(count: number): string {
  if (count < 50) {
    return '0-50';
  }
  if (count < 100) {
    return '50-100';
  }
  if (count < 200) {
    return '100-200';
  }
  return '200+';
}

interface GameInstruments {
  tickDuration: Histogram;
  frameDuration: Histogram;
  entities: Histogram;
  catchupTicks: Histogram;
  wave: UpDownCounter;
  peers: UpDownCounter;
  fingerprintMismatch: Counter;
  inputDelay: Histogram;
  rejoin: Counter;
}

let instruments: GameInstruments | undefined;

function getInstruments(): GameInstruments {
  if (instruments === undefined) {
    const meter = getMeter();
    instruments = {
      tickDuration: meter.createHistogram('vs.simulation.tick.duration', {
        unit: 'ms',
        description: 'Durée d’un pas de simulation, mesurée depuis la couche client.',
      }),
      frameDuration: meter.createHistogram('vs.render.frame.duration', {
        unit: 'ms',
        description: 'Durée d’une image, pour distinguer un coût de rendu d’un coût de simulation.',
      }),
      entities: meter.createHistogram('vs.simulation.entities', {
        description: 'Population par nature d’entité.',
      }),
      catchupTicks: meter.createHistogram('vs.simulation.catchup.ticks', {
        description: 'Ticks joués dans une même image ; au-delà de 1, la boucle rattrape.',
      }),
      wave: meter.createUpDownCounter('vs.simulation.wave', {
        description: 'Vague courante, pour situer une mesure dans la difficulté.',
      }),
      peers: meter.createUpDownCounter('vs.coop.peers', {
        description: 'Pairs réellement actifs dans la partie.',
      }),
      fingerprintMismatch: meter.createCounter('vs.coop.fingerprint.mismatch', {
        description: 'Divergences d’état détectées — le signal le plus grave du lockstep.',
      }),
      inputDelay: meter.createHistogram('vs.coop.input.delay', {
        unit: '{tick}',
        description: 'Retard entre l’entrée capturée et le tick simulé.',
      }),
      rejoin: meter.createCounter('vs.coop.rejoin', {
        description: 'Tentatives de réintégration, par issue.',
      }),
    };
  }
  return instruments;
}

/** Remet les instruments à zéro. Réservé aux tests, qui changent de fournisseur en cours d'exécution. */
export function resetGameInstruments(): void {
  instruments = undefined;
}

export interface GameSessionDescriptor {
  seed: string;
  mode: GameMode;
  playersCount: number;
  /** Code de salon coopératif ; **jamais émis en clair**, seulement haché. */
  roomCode?: string;
}

/**
 * Attributs du span racine d'une partie.
 *
 * Exportée à part pour être testable telle quelle : le test du contrat d'observabilité vérifie
 * qu'aucune donnée interdite ne peut se glisser ici, et c'est la seule porte d'entrée.
 */
export function gameSessionAttributes(descriptor: GameSessionDescriptor): Attributes {
  const config = telemetryConfig();
  return {
    'vs.seed': descriptor.seed,
    'vs.mode': descriptor.mode,
    'vs.players.count': descriptor.playersCount,
    ...(descriptor.roomCode === undefined
      ? {}
      : { 'vs.room.code.hash': hashRoomCode(descriptor.roomCode) }),
    'service.version': config.serviceVersion,
    'deployment.environment.name': config.environment,
  };
}

/**
 * Span racine d'une partie : de son lancement à sa fin.
 *
 * **Jamais de span par tick, par image ou par projectile.** À vingt ticks par seconde, ce serait
 * 72 000 traces par heure et par joueur : le coût dépasserait le jeu et noierait le signal. La
 * boucle est suivie par des métriques agrégées, la partie par une trace.
 */
export function startGameSessionSpan(descriptor: GameSessionDescriptor): Span {
  return getTracer().startSpan('game.session', {
    attributes: gameSessionAttributes(descriptor),
  });
}

/** Termine une partie en consignant son issue ; `error` marque le span comme fautif. */
export function endGameSessionSpan(
  span: Span,
  outcome: 'defeat' | 'left' | 'error',
  attributes: Attributes = {},
): void {
  span.setAttributes({ 'vs.outcome': outcome, ...attributes });
  if (outcome === 'error') {
    span.setStatus({ code: SpanStatusCode.ERROR });
  }
  span.end();
}

export function recordTickDuration(
  durationMs: number,
  attributes: { mode: GameMode; playersCount: number; monsters: number },
): void {
  getInstruments().tickDuration.record(durationMs, {
    'vs.mode': attributes.mode,
    'vs.players.count': attributes.playersCount,
    'vs.monsters.bucket': monstersBucket(attributes.monsters),
  });
}

export function recordFrameDuration(durationMs: number, monsters: number): void {
  getInstruments().frameDuration.record(durationMs, {
    'vs.monsters.bucket': monstersBucket(monsters),
  });
}

export function recordEntities(counts: {
  monsters: number;
  projectiles: number;
  scrap: number;
}): void {
  const { entities } = getInstruments();
  entities.record(counts.monsters, { 'vs.kind': 'monster' });
  entities.record(counts.projectiles, { 'vs.kind': 'projectile' });
  entities.record(counts.scrap, { 'vs.kind': 'scrap' });
}

export function recordCatchupTicks(ticks: number): void {
  getInstruments().catchupTicks.record(ticks);
}

export function recordWave(wave: number, previousWave: number): void {
  // Une jauge se construit ici par différence : l'API ne propose pas d'écriture absolue
  // synchrone, et la vague ne recule jamais au sein d'une partie.
  const delta = wave - previousWave;
  if (delta !== 0) {
    getInstruments().wave.add(delta);
  }
}

export function recordPeerChange(delta: number): void {
  getInstruments().peers.add(delta);
}

export function recordFingerprintMismatch(role: 'coordinator' | 'peer'): void {
  getInstruments().fingerprintMismatch.add(1, { 'vs.peer.role': role });
}

export function recordInputDelay(ticks: number): void {
  getInstruments().inputDelay.record(ticks);
}

export function recordRejoin(outcome: 'success' | 'history-unavailable' | 'timeout'): void {
  getInstruments().rejoin.add(1, { 'vs.outcome': outcome });
}
