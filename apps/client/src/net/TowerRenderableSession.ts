import type { TowerSession, Vector2 } from '@village-survivor/protocol';

/** Frontière de production entre le serveur autoritaire et le rendu Phaser. */
export interface TowerRenderableSession extends TowerSession {
  getRenderAlpha(): number;
  getLocalRenderPosition(): Vector2 | undefined;
  onConnectionIssue(listener: (message: string, terminal?: boolean) => void): () => void;
}
