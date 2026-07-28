import type { GameContent, UpgradeDefinition } from '@village-survivor/content';
import type {
  EnemyState,
  GameEvent,
  GamePhase,
  GameStatus,
  InteractionChannelState,
  InventorySlot,
  PlayerState,
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
function describeAvatarInteractionChannel(
  source: SnapshotSource,
  avatar: MutablePlayer,
): {
  interactionChannel?: InteractionChannelState;
} {
  const channel = avatar.interactionChannel;
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
  /** Avatar « principal » (compat solo). En co-op, voir `players`. */
  player: MutablePlayer;
  /**
   * Tous les avatars avec leur identifiant. Optionnel tant que la simulation N joueurs
   * n'est pas branchée : si absent, on retombe sur `[{ avatar: player, id: 'player-1' }]`.
   */
  players?: readonly { avatar: MutablePlayer; id: string }[];
  /** Identifiant de l'avatar local à exposer via `PublicGameState.player`. */
  localPlayerId?: string;
  village: MutableVillage;
  defenses: readonly MutableDefense[];
  resources: readonly MutableResource[];
  enemies: readonly MutableEnemy[];
  upgradeChoices: readonly UpgradeDefinition[];
  interactionHint: string | undefined;
  objective: string;
  events: readonly GameEvent[];
}

/**
 * Construit la projection publique d'un avatar. Les champs de progression (niveau,
 * améliorations, statuts d'épée…) sont partagés en co-op : ils proviennent tous du
 * même `MutablePlayer`, donc chaque avatar affiche le même niveau.
 */
function buildPlayerState(source: SnapshotSource, avatar: MutablePlayer, id: string): PlayerState {
  return {
    id,
    position: { ...avatar.position },
    hp: avatar.hp,
    maxHp: avatar.maxHp,
    ward: avatar.ward,
    maxWard: avatar.maxWard,
    moveSpeed: avatar.moveSpeed,
    inventory: cloneInventory(avatar.inventory),
    experience: avatar.experience,
    experienceToNext: avatar.experienceToNext,
    level: avatar.level,
    swordAutoDamage: avatar.swordAutoDamage,
    swordAutoRange: avatar.swordAutoRange,
    swordAutoCooldownMs: avatar.swordAutoCooldownMs,
    swordAutoCooldownRemainingMs: avatar.swordAutoCooldownRemainingMs,
    sword: {
      cooldownMs: avatar.swordCooldownMs,
      cooldownRemainingMs: avatar.swordCooldownRemainingMs,
    },
    barrier: {
      cooldownMs: avatar.barrierCooldownMs,
      cooldownRemainingMs: avatar.barrierCooldownRemainingMs,
      activeRemainingMs: avatar.barrierActiveRemainingMs,
    },
    heal: {
      cooldownMs: avatar.healCooldownMs,
      cooldownRemainingMs: avatar.healCooldownRemainingMs,
      buffRemainingMs: avatar.healBuffRemainingMs,
    },
    ...describeAvatarInteractionChannel(source, avatar),
    ...(avatar.interactionHint === undefined ? {} : { interactionHint: avatar.interactionHint }),
    selectedUpgrades: [...avatar.selectedUpgrades],
    pendingUpgrades: avatar.pendingUpgrades,
    upgradeChoices: avatar.upgradeChoices.map((upgrade): UpgradeChoice => ({
      id: upgrade.id,
      name: upgrade.name,
      description: upgrade.description,
      discipline: upgrade.discipline,
    })),
    downedRemainingMs: avatar.downedRemainingMs,
  };
}

export function createPublicGameState(source: SnapshotSource): PublicGameState {
  const result = source.resultReason === undefined ? {} : { resultReason: source.resultReason };
  const hint =
    source.interactionHint === undefined ? {} : { interactionHint: source.interactionHint };
  // Étape multijoueur en cours : la simulation ne gère encore qu'un avatar. On
  // publie néanmoins le contrat `players[]` (ici un seul élément) pour que le rendu
  // et le netcode s'appuient déjà dessus.
  const avatars: readonly { avatar: MutablePlayer; id: string }[] =
    source.players !== undefined ? source.players : [{ avatar: source.player, id: 'player-1' }];
  const players = avatars.map(({ avatar, id }) => buildPlayerState(source, avatar, id));
  const localPlayer =
    players.find(({ id }) => id === source.localPlayerId) ??
    players[0] ??
    buildPlayerState(source, source.player, 'player-1');
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
    player: localPlayer,
    players,
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
