import type { GameContent, UpgradeDefinition } from '@village-survivor/content';
import type {
  EnemyState,
  GameEvent,
  GamePhase,
  GameStatus,
  InteractionChannelState,
  InventorySlot,
  PublicGameState,
  UpgradeChoice,
} from '@village-survivor/protocol';

import type {
  MutableDefense,
  MutableEnemy,
  MutableInventory,
  MutablePlayer,
  MutableResource,
  MutableVillage,
} from './state.js';

function cloneInventory(inventory: MutableInventory): (InventorySlot | undefined)[] {
  return inventory.map((slot) => (slot === undefined ? undefined : { ...slot }));
}

/**
 * Traduit le canal d'interaction interne en projection publique. Renvoie un objet
 * vide (clé omise) quand aucun canal n'est actif, pour rester comparable par égalité.
 */
function describeInteractionChannel(source: SnapshotSource): {
  interactionChannel?: InteractionChannelState;
} {
  const channel = source.player.interactionChannel;
  if (channel === undefined) {
    return {};
  }
  const progress = channel.totalMs <= 0 ? 1 : 1 - channel.remainingMs / channel.totalMs;
  if (channel.kind === 'harvest') {
    const resource = source.resources.find((candidate) => candidate.id === channel.targetId);
    return {
      interactionChannel: {
        progress,
        kind: 'harvest',
        ...(resource === undefined ? {} : { resourceType: resource.resourceType }),
      },
    };
  }
  return { interactionChannel: { progress, kind: 'repair' } };
}

export interface SnapshotSource {
  tick: number;
  elapsedMs: number;
  status: GameStatus;
  resultReason: string | undefined;
  seed: string;
  content: GameContent;
  phase: GamePhase;
  cycle: number;
  phaseRemainingMs: number;
  player: MutablePlayer;
  village: MutableVillage;
  defenses: readonly MutableDefense[];
  resources: readonly MutableResource[];
  enemies: readonly MutableEnemy[];
  upgradeChoices: readonly UpgradeDefinition[];
  interactionHint: string | undefined;
  objective: string;
  events: readonly GameEvent[];
}

export function createPublicGameState(source: SnapshotSource): PublicGameState {
  const result = source.resultReason === undefined ? {} : { resultReason: source.resultReason };
  const hint =
    source.interactionHint === undefined ? {} : { interactionHint: source.interactionHint };
  return {
    tick: source.tick,
    elapsedMs: source.elapsedMs,
    status: source.status,
    ...result,
    seed: source.seed,
    world: {
      width: source.content.world.width,
      height: source.content.world.height,
    },
    phase: source.phase,
    cycle: source.cycle,
    phaseRemainingMs: Math.max(0, source.phaseRemainingMs),
    player: {
      id: 'player-1',
      position: { ...source.player.position },
      hp: source.player.hp,
      maxHp: source.player.maxHp,
      ward: source.player.ward,
      maxWard: source.player.maxWard,
      moveSpeed: source.player.moveSpeed,
      inventory: cloneInventory(source.player.inventory),
      experience: source.player.experience,
      experienceToNext: source.player.experienceToNext,
      level: source.player.level,
      swordAutoDamage: source.player.swordAutoDamage,
      swordAutoRange: source.player.swordAutoRange,
      swordAutoCooldownMs: source.player.swordAutoCooldownMs,
      swordAutoCooldownRemainingMs: source.player.swordAutoCooldownRemainingMs,
      sword: {
        cooldownMs: source.player.swordCooldownMs,
        cooldownRemainingMs: source.player.swordCooldownRemainingMs,
      },
      barrier: {
        cooldownMs: source.player.barrierCooldownMs,
        cooldownRemainingMs: source.player.barrierCooldownRemainingMs,
        activeRemainingMs: source.player.barrierActiveRemainingMs,
      },
      heal: {
        cooldownMs: source.player.healCooldownMs,
        cooldownRemainingMs: source.player.healCooldownRemainingMs,
        buffRemainingMs: source.player.healBuffRemainingMs,
      },
      ...describeInteractionChannel(source),
      selectedUpgrades: [...source.player.selectedUpgrades],
      pendingUpgrades: source.player.pendingUpgrades,
    },
    village: {
      position: { ...source.village.position },
      areaRadius: source.content.village.areaRadius,
      hp: source.village.hp,
      maxHp: source.village.maxHp,
      heartLevel: source.village.heartLevel,
      underAttack: source.village.underAttack,
      inventory: cloneInventory(source.village.inventory),
    },
    defenses: source.defenses.map((defense) => ({
      id: defense.id,
      position: { ...defense.position },
      built: defense.built,
      hp: defense.hp,
      maxHp: defense.maxHp,
      range: source.content.defense.range,
      cooldownRemainingMs: defense.cooldownRemainingMs,
      buildRemainingMs: defense.buildRemainingMs,
      buildDurationMs: source.content.defense.buildDurationMs,
    })),
    resources: source.resources.map((resource) => ({
      id: resource.id,
      position: { ...resource.position },
      resourceType: resource.resourceType,
      amountRemaining: resource.amountRemaining,
      guardianId: resource.guardianId,
    })),
    enemies: source.enemies.map((enemy): EnemyState => ({
      id: enemy.id,
      kind: enemy.kind,
      position: { ...enemy.position },
      home: { ...enemy.home },
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      awake: enemy.awake,
      attackCooldownRemainingMs: enemy.attackCooldownRemainingMs,
    })),
    upgradeChoices: source.upgradeChoices.map((upgrade): UpgradeChoice => ({
      id: upgrade.id,
      name: upgrade.name,
      description: upgrade.description,
      discipline: upgrade.discipline,
    })),
    ...hint,
    objective: source.objective,
    events: source.events.map((event) => ({
      ...event,
      ...(event.position === undefined ? {} : { position: { ...event.position } }),
      ...(event.origin === undefined ? {} : { origin: { ...event.origin } }),
    })),
  };
}
