import type { GameContent } from '@village-survivor/content';
import type { GameEventType, GamePhase, Vector2 } from '@village-survivor/protocol';

import { distance, moveTowards } from './geometry.js';
import type { MutableDefense, MutableEnemy, MutablePlayer, MutableVillage } from './state.js';
import { findNearestDefense, findNearestEnemy } from './targeting.js';

type EventDetails = Readonly<{ position?: Vector2; origin?: Vector2; amount?: number }>;

export interface CombatContext {
  content: GameContent;
  enemies: MutableEnemy[];
  defenses: MutableDefense[];
  /** Tous les avatars de la partie (un seul en solo). Les ennemis ciblent le plus proche vivant. */
  players: MutablePlayer[];
  village: MutableVillage;
  damageEnemy(enemy: MutableEnemy, amount: number): void;
  /** Point d'entrée UNIQUE des dégâts subis par un avatar donné. */
  damagePlayer(avatar: MutablePlayer, amount: number, attackerPosition: Vector2): void;
  destroyDefense(defense: MutableDefense): void;
  addEvent(type: GameEventType, message: string, details?: EventDetails): void;
}

/** Avatar VIVANT le plus proche d'une position, ou `undefined` si tous sont à terre. */
function nearestLivingAvatar(
  players: readonly MutablePlayer[],
  position: Vector2,
): MutablePlayer | undefined {
  let nearest: MutablePlayer | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const avatar of players) {
    if (avatar.hp <= 0) {
      continue;
    }
    const candidateDistance = distance(avatar.position, position);
    if (candidateDistance < nearestDistance) {
      nearestDistance = candidateDistance;
      nearest = avatar;
    }
  }
  return nearest;
}

export function updateDefenseCombat(context: CombatContext): void {
  for (const defense of context.defenses) {
    if (!defense.built || defense.cooldownRemainingMs > 0) {
      continue;
    }
    const target = findNearestEnemy(
      context.enemies,
      defense.position,
      context.content.defense.range,
      (enemy) => enemy.hp > 0 && enemy.awake && enemy.kind !== 'guardian',
    );
    if (target === undefined) {
      continue;
    }
    context.addEvent('defense-fired', 'Une baliste tire.', {
      origin: defense.position,
      position: target.position,
    });
    context.damageEnemy(target, context.content.defense.damage);
    defense.cooldownRemainingMs = context.content.defense.cooldownMs;
  }
}

export function updateEnemyCombat(
  context: CombatContext,
  phase: GamePhase,
  deltaMs: number,
  deltaSeconds: number,
): void {
  for (const enemy of context.enemies) {
    if (enemy.hp <= 0) {
      continue;
    }
    enemy.attackCooldownRemainingMs = Math.max(0, enemy.attackCooldownRemainingMs - deltaMs);
    if (enemy.kind === 'guardian') {
      updateGuardian(context, enemy, deltaSeconds);
    } else if (phase === 'day') {
      updateDayEnemy(context, enemy, deltaSeconds);
    } else {
      updateAssaultEnemy(context, enemy, deltaSeconds);
    }
  }
}

function updateGuardian(context: CombatContext, enemy: MutableEnemy, deltaSeconds: number): void {
  const target = nearestLivingAvatar(context.players, enemy.position);
  const playerDistance =
    target === undefined ? Number.POSITIVE_INFINITY : distance(enemy.position, target.position);
  const homeDistance = distance(enemy.position, enemy.home);
  if (
    target !== undefined &&
    (playerDistance <= context.content.enemyBehavior.guardianAggroRange ||
      (enemy.awake && playerDistance <= context.content.enemyBehavior.guardianChaseRange))
  ) {
    enemy.awake = true;
    moveOrAttackPlayer(context, enemy, target, deltaSeconds);
    return;
  }
  if (homeDistance > context.content.enemyBehavior.guardianReturnTolerance) {
    const definition = context.content.enemies.guardian;
    enemy.position = moveTowards(enemy.position, enemy.home, definition.speed * deltaSeconds);
  } else {
    enemy.awake = false;
  }
}

function updateDayEnemy(context: CombatContext, enemy: MutableEnemy, deltaSeconds: number): void {
  const target = nearestLivingAvatar(context.players, enemy.position);
  const playerDistance =
    target === undefined ? Number.POSITIVE_INFINITY : distance(enemy.position, target.position);
  if (
    target !== undefined &&
    (playerDistance <= context.content.enemyBehavior.dayAggroRange ||
      (enemy.awake && playerDistance <= context.content.enemyBehavior.dayChaseRange))
  ) {
    enemy.awake = true;
    moveOrAttackPlayer(context, enemy, target, deltaSeconds);
    return;
  }
  if (distance(enemy.position, enemy.home) > context.content.enemyBehavior.dayReturnTolerance) {
    const definition = context.content.enemies[enemy.kind];
    enemy.position = moveTowards(enemy.position, enemy.home, definition.speed * deltaSeconds);
  } else {
    enemy.awake = false;
  }
}

function updateAssaultEnemy(
  context: CombatContext,
  enemy: MutableEnemy,
  deltaSeconds: number,
): void {
  enemy.awake = true;
  const target = nearestLivingAvatar(context.players, enemy.position);
  if (
    target !== undefined &&
    distance(enemy.position, target.position) <=
      context.content.enemyBehavior.assaultPlayerPriorityRange
  ) {
    moveOrAttackPlayer(context, enemy, target, deltaSeconds);
    return;
  }

  const nearbyDefense = findNearestDefense(
    context.defenses,
    enemy.position,
    context.content.enemyBehavior.assaultDefenseDetectionRange,
  );
  if (nearbyDefense !== undefined) {
    moveOrAttackDefense(context, enemy, nearbyDefense, deltaSeconds);
    return;
  }
  moveOrAttackVillage(context, enemy, deltaSeconds);
}

function moveOrAttackPlayer(
  context: CombatContext,
  enemy: MutableEnemy,
  target: MutablePlayer,
  deltaSeconds: number,
): void {
  const definition = context.content.enemies[enemy.kind];
  if (
    distance(enemy.position, target.position) <=
    definition.attackRange + context.content.enemyBehavior.collisionRadius
  ) {
    if (enemy.attackCooldownRemainingMs <= 0) {
      context.damagePlayer(target, definition.damage * enemy.damageScale, enemy.position);
      enemy.attackCooldownRemainingMs = definition.attackCooldownMs;
    }
    return;
  }
  enemy.position = moveTowards(enemy.position, target.position, definition.speed * deltaSeconds);
}

function moveOrAttackDefense(
  context: CombatContext,
  enemy: MutableEnemy,
  defense: MutableDefense,
  deltaSeconds: number,
): void {
  const definition = context.content.enemies[enemy.kind];
  if (
    distance(enemy.position, defense.position) <=
    definition.attackRange + context.content.enemyBehavior.defenseContactPadding
  ) {
    if (enemy.attackCooldownRemainingMs <= 0) {
      defense.hp = Math.max(0, defense.hp - definition.damage * enemy.damageScale);
      enemy.attackCooldownRemainingMs = definition.attackCooldownMs;
      if (defense.hp <= 0) {
        context.destroyDefense(defense);
      }
    }
    return;
  }
  enemy.position = moveTowards(enemy.position, defense.position, definition.speed * deltaSeconds);
}

function moveOrAttackVillage(
  context: CombatContext,
  enemy: MutableEnemy,
  deltaSeconds: number,
): void {
  const definition = context.content.enemies[enemy.kind];
  if (
    distance(enemy.position, context.village.position) <=
    definition.attackRange + context.content.enemyBehavior.villageContactPadding
  ) {
    if (enemy.attackCooldownRemainingMs <= 0) {
      let damage = definition.damage * enemy.damageScale;
      // La réduction s'applique si UN avatar au moins couvre le village de sa barrière.
      const villageShielded = context.players.some(
        (avatar) =>
          avatar.barrierActiveRemainingMs > 0 &&
          distance(avatar.position, context.village.position) <=
            context.content.barrier.activeRadius,
      );
      if (villageShielded) {
        damage *= 1 - context.content.barrier.damageReduction;
      }
      context.village.hp = Math.max(0, context.village.hp - damage);
      context.village.underAttack = true;
      enemy.attackCooldownRemainingMs = definition.attackCooldownMs;
      context.addEvent('village-hurt', `Le village subit ${Math.ceil(damage)} dégâts.`, {
        position: context.village.position,
        amount: damage,
      });
    }
    return;
  }
  enemy.position = moveTowards(
    enemy.position,
    context.village.position,
    definition.speed * deltaSeconds,
  );
}
