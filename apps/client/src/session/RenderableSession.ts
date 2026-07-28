import type { GameSession } from '@village-survivor/protocol';

/**
 * Session telle que la scène de rendu l'attend : le contrat réseau `GameSession`
 * (start/stop/sendInput/subscribe) plus `getRenderAlpha()`, la fraction de
 * progression (0..1) vers le prochain tick servant à interpoler l'affichage entre
 * deux états. `LocalSession` (solo) comme les sessions co-op (hôte/invité) l'implémentent,
 * ce qui permet à `GameScene` de fonctionner indifféremment avec l'une ou l'autre.
 */
export interface RenderableSession extends GameSession {
  getRenderAlpha(): number;
}
