import { SpanStatusCode, type Attributes, type Span } from '@opentelemetry/api';
import type { Histogram } from '@opentelemetry/api';
import {
  getMeter,
  getTracer,
  sessionContext,
  setSessionSpan,
  telemetryConfig,
} from './telemetry.js';

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
  frameDuration: Histogram;
}

let instruments: GameInstruments | undefined;

function getInstruments(): GameInstruments {
  if (instruments === undefined) {
    const meter = getMeter();
    instruments = {
      frameDuration: meter.createHistogram('vs.render.frame.duration', {
        unit: 'ms',
        description: 'Durée d’une image, pour distinguer un coût de rendu d’un coût de simulation.',
      }),
    };
  }
  return instruments;
}

export interface GameSessionDescriptor {
  mode: GameMode;
  playersCount: number;
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
    'vs.mode': descriptor.mode,
    'vs.players.count': descriptor.playersCount,
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
  const span = getTracer().startSpan('game.client.session', {
    attributes: gameSessionAttributes(descriptor),
  });
  // Ancre de rattachement : tout ce qui suit — spans de jonction, crédit d'or, journaux — s'y
  // raccroche. Sans elle, chaque span serait une trace isolée et les journaux ne porteraient
  // aucun identifiant de corrélation.
  setSessionSpan(span);
  return span;
}

/**
 * Span rattaché à la partie en cours.
 *
 * Hors partie, retombe sur une trace autonome plutôt que d'échouer : une frontière observée est
 * toujours préférable à un trou.
 */
export function startGameChildSpan(name: string, attributes: Attributes = {}): Span {
  return getTracer().startSpan(name, { attributes }, sessionContext());
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
  setSessionSpan(undefined);
}

export function recordFrameDuration(durationMs: number, monsters: number): void {
  getInstruments().frameDuration.record(durationMs, {
    'vs.monsters.bucket': monstersBucket(monsters),
  });
}
