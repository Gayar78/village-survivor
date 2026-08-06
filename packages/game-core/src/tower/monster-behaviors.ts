import type { TowerMonsterSignature } from '@village-survivor/content';
import type { TowerMonsterKind } from '@village-survivor/protocol';

export type MonsterMovementPattern =
  | 'direct'
  | 'zigzag'
  | 'pounce'
  | 'swarm'
  | 'avoid-player'
  | 'skirmish'
  | 'orbit-ally'
  | 'burrow'
  | 'blink'
  | 'dash';

export type MonsterAbilityKind =
  'ranged' | 'heal' | 'bolster' | 'summon' | 'control' | 'slam' | 'disable';

export type MonsterContactEffect = 'none' | 'poison' | 'drain' | 'slow' | 'drag' | 'chain';

export type MonsterDeathEffect = Readonly<{
  childKind: TowerMonsterKind;
  count: number;
}>;

export type MonsterBehaviorProfile = Readonly<{
  movement: MonsterMovementPattern;
  ability?: Readonly<{
    kind: MonsterAbilityKind;
    cooldownMs: number;
    telegraphMs: number;
    range: number;
    radius: number;
    power: number;
    childKind?: TowerMonsterKind;
    childCount?: number;
    maxUses?: number;
    disableDurationMs?: number;
    retreatDurationMs?: number;
  }>;
  contact: MonsterContactEffect;
  regenerationPerSecond?: number;
  growthPerSecond?: number;
  incomingDamageMultiplier?: number;
  mergeWithOwnKind?: boolean;
  volatileLifetimeMs?: number;
  reviveFraction?: number;
  death?: MonsterDeathEffect;
}>;

const MOVEMENT_BY_SIGNATURE: Partial<Record<TowerMonsterSignature, MonsterMovementPattern>> = {
  'zigzag-combo': 'zigzag',
  'circle-pounce': 'pounce',
  'summon-pack': 'pounce',
  'flying-swarm': 'swarm',
  'flying-xp-shot': 'skirmish',
  'avoid-player': 'avoid-player',
  'pack-flank': 'zigzag',
  'burrow-emerge': 'burrow',
  'blink-cycle': 'blink',
  'snipe-teleport': 'blink',
  'dash-through': 'dash',
  'telegraphed-snipe': 'skirmish',
  'partner-shot': 'orbit-ally',
  'minigun-burst': 'skirmish',
  'wounded-structure-raid': 'dash',
  'grenade-barrage': 'skirmish',
  'slow-projectile': 'skirmish',
  'mobile-cannon': 'skirmish',
  'kidnap-drag': 'dash',
  'burrow-turret': 'burrow',
  'landing-rush': 'dash',
  'tiny-hop': 'pounce',
  'portal-summon': 'orbit-ally',
};

const RANGED = new Set<TowerMonsterSignature>([
  'flying-xp-shot',
  'poison-projectile',
  'snipe-teleport',
  'partner-shot',
  'telegraphed-snipe',
  'minigun-burst',
  'grenade-barrage',
  'slow-projectile',
  'mobile-cannon',
  'combat-battery',
]);

const HEAL = new Set<TowerMonsterSignature>(['area-heal', 'emergency-heal', 'repair-heavy']);

const BOLSTER = new Set<TowerMonsterSignature>([
  'ally-shield',
  'herd-allies',
  'ally-camouflage',
  'copy-buff',
  'battle-orders',
  'slow-resist-aura',
  'ally-buff',
  'battle-cry',
  'revive-burning-aura',
]);

const CONTROL = new Set<TowerMonsterSignature>([
  'web-network',
  'web-trail',
  'sand-puddle',
  'freeze-death-zone',
  'chain-radius',
  'kidnap-drag',
  'temporal-control',
  'freeze-position-rollback',
  'short-curse',
]);

const SLAM = new Set<TowerMonsterSignature>([
  'structure-slam',
  'sand-slam',
  'structure-ram',
  'guardian-arena-slam',
]);

const MERGING = new Set<TowerMonsterSignature>([
  'slime-merge',
  'growing-merge',
  'resistant-merge',
  'split-merge',
  'explosive-merge',
]);

const SUMMON_BY_SIGNATURE: Partial<
  Record<TowerMonsterSignature, readonly [TowerMonsterKind, number]>
> = {
  'throw-ally': ['bat', 1],
  'spider-brood': ['weaver-spider', 2],
  'growing-brood': ['mini-beetle', 2],
  'soul-resurrection': ['skeleton-small', 2],
  'summon-pack': ['wolf', 2],
  'portal-summon': ['skeleton-small', 2],
  'carry-units': ['mini-beetle', 2],
  'cargo-assault': ['explosive-robot', 1],
  'lob-squad': ['squadling', 2],
};

const DEATH_BY_SIGNATURE: Partial<Record<TowerMonsterSignature, MonsterDeathEffect>> = {
  'split-small': { childKind: 'skeleton-small', count: 2 },
  'split-medium': { childKind: 'skeleton-medium', count: 2 },
  'split-merge': { childKind: 'mini-slime', count: 3 },
  'explosive-merge': { childKind: 'explosive-robot', count: 1 },
};

const CONTACT_BY_SIGNATURE: Partial<Record<TowerMonsterSignature, MonsterContactEffect>> = {
  'poison-sting': 'poison',
  'poison-projectile': 'poison',
  'health-drain': 'drain',
  'slow-projectile': 'slow',
  'freeze-death-zone': 'slow',
  'kidnap-drag': 'drag',
  'chain-radius': 'chain',
  'freeze-position-rollback': 'slow',
  'latch-bite': 'drain',
};

/**
 * Traduit les signatures Torri en un petit nombre de primitives dÃ©terministes.
 * Les diffÃ©rences de cible, silhouette, taille et statistiques restent portÃ©es par
 * le catalogue : ce profil ajoute le mouvement, l'action et les effets de contact.
 */
export function monsterBehaviorProfile(signature: TowerMonsterSignature): MonsterBehaviorProfile {
  const movement = MOVEMENT_BY_SIGNATURE[signature] ?? 'direct';
  const contact = CONTACT_BY_SIGNATURE[signature] ?? 'none';
  const death = DEATH_BY_SIGNATURE[signature];
  const summon = SUMMON_BY_SIGNATURE[signature];

  let ability: MonsterBehaviorProfile['ability'];
  if (summon !== undefined) {
    ability = {
      kind: 'summon',
      cooldownMs: 8_000,
      telegraphMs: 650,
      range: 0,
      radius: 110,
      power: 0,
      childKind: summon[0],
      childCount: summon[1],
      maxUses: 3,
    };
  } else if (RANGED.has(signature)) {
    ability = {
      kind: 'ranged',
      cooldownMs: signature === 'minigun-burst' ? 1_300 : 3_200,
      telegraphMs: signature === 'telegraphed-snipe' ? 1_100 : 500,
      range: signature === 'telegraphed-snipe' ? 620 : 390,
      radius: signature === 'grenade-barrage' ? 92 : 28,
      power: signature === 'telegraphed-snipe' ? 1.8 : 0.75,
    };
  } else if (HEAL.has(signature)) {
    ability = {
      kind: 'heal',
      cooldownMs: signature === 'emergency-heal' ? 4_500 : 5_800,
      telegraphMs: 600,
      range: 0,
      radius: signature === 'area-heal' ? 230 : 150,
      power: signature === 'repair-heavy' ? 0.18 : 0.12,
    };
  } else if (BOLSTER.has(signature)) {
    ability = {
      kind: 'bolster',
      cooldownMs: 6_200,
      telegraphMs: 450,
      range: 0,
      radius: 210,
      power: 0.08,
    };
  } else if (CONTROL.has(signature)) {
    ability = {
      kind: 'control',
      cooldownMs: 5_200,
      telegraphMs: 750,
      range: 350,
      radius: 125,
      power: 0.45,
    };
  } else if (SLAM.has(signature)) {
    ability = {
      kind: 'slam',
      cooldownMs: signature === 'guardian-arena-slam' ? 4_000 : 5_400,
      telegraphMs: signature === 'guardian-arena-slam' ? 1_200 : 850,
      range: 0,
      radius: signature === 'guardian-arena-slam' ? 280 : 135,
      power: signature === 'guardian-arena-slam' ? 1.5 : 1.05,
    };
  } else if (signature === 'turret-disable') {
    ability = {
      kind: 'disable',
      cooldownMs: 7_000,
      telegraphMs: 900,
      range: 300,
      radius: 0,
      power: 1,
      maxUses: 1,
      disableDurationMs: 650,
      retreatDurationMs: 3_000,
    };
  }

  return {
    movement,
    ...(ability === undefined ? {} : { ability }),
    contact,
    ...(signature === 'out-of-combat-regen' ? { regenerationPerSecond: 0.035 } : {}),
    ...(signature === 'growing-merge' || signature === 'growing-brood'
      ? { growthPerSecond: 0.018 }
      : {}),
    ...(signature === 'resistant-merge' || signature === 'frontal-guard'
      ? { incomingDamageMultiplier: signature === 'frontal-guard' ? 0.72 : 0.8 }
      : {}),
    ...(MERGING.has(signature) ? { mergeWithOwnKind: true } : {}),
    ...(signature === 'volatile-lifetime' ? { volatileLifetimeMs: 7_500 } : {}),
    ...(signature === 'revive-bandages' || signature === 'revive-burning-aura'
      ? { reviveFraction: 0.42 }
      : {}),
    ...(death === undefined ? {} : { death }),
  };
}
