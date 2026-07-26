import type { GameContent } from '@village-survivor/content';
import type { PlayerInput } from '@village-survivor/protocol';

import { clampPosition, normalized } from './geometry.js';
import type { MutablePlayer } from './state.js';

export function updatePlayerMovement(
  player: MutablePlayer,
  input: PlayerInput,
  deltaSeconds: number,
  world: GameContent['world'],
  blocked: boolean,
): void {
  if (blocked) {
    return;
  }
  const movement = normalized({ x: input.moveX, y: input.moveY });
  const nextPosition = {
    x: player.position.x + movement.x * player.moveSpeed * deltaSeconds,
    y: player.position.y + movement.y * player.moveSpeed * deltaSeconds,
  };
  player.position = clampPosition(nextPosition, world.width, world.height);
  if (input.aimX !== undefined && input.aimY !== undefined) {
    const aim = normalized({ x: input.aimX, y: input.aimY });
    if (aim.x !== 0 || aim.y !== 0) {
      player.lastAim = aim;
    }
  }
}
