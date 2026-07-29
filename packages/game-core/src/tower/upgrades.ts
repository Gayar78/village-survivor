// Catalogue MVP des cartes de montée de niveau (Lot A). Chaque carte porte une rareté
// (pondérée dans `tuning.ts`) et un effet `apply(player)` appliqué au « build » PERSONNEL
// de l'avatar qui la choisit. Les cartes peuvent s'empiler d'une offre à l'autre.

import type { TowerWeaponId, UpgradeRarity } from '@village-survivor/protocol';

import { TURRET_SHOP_EFFECTS } from './tuning.js';
import type { MutableTowerPlayer } from './state.js';

export interface UpgradeCardDefinition {
  id: string;
  rarity: UpgradeRarity;
  label: string;
  description: string;
  weaponId?: TowerWeaponId;
  isEligible?: (player: MutableTowerPlayer) => boolean;
  apply: (player: MutableTowerPlayer) => void;
}

/** Borne basse de cadence (partagée avec la tourelle pour rester cohérent). */
const MIN_FIRE_RATE = TURRET_SHOP_EFFECTS.rateMinimum;

function weaponUpgrade(
  player: MutableTowerPlayer,
  id: TowerWeaponId,
): MutableTowerPlayer['weapons'][number] {
  const weapon = player.weapons.find((candidate) => candidate.id === id);
  if (weapon === undefined) {
    throw new Error(`Amélioration reçue pour une arme absente : ${id}`);
  }
  weapon.level += 1;
  return weapon;
}

export const UPGRADE_CATALOG: readonly UpgradeCardDefinition[] = [
  // ── common ────────────────────────────────────────────────────────────────
  {
    id: 'dmg-up',
    rarity: 'common',
    label: 'Munitions affûtées',
    description: '+15 % de dégâts.',
    apply: (player) => {
      player.bulletDamage *= 1.15;
    },
  },
  {
    id: 'rate-up',
    rarity: 'common',
    label: 'Détente rapide',
    description: '+8 % de cadence de tir.',
    apply: (player) => {
      player.fireRate = Math.max(MIN_FIRE_RATE, player.fireRate * 0.92);
    },
  },
  {
    id: 'move-up',
    rarity: 'common',
    label: 'Semelles légères',
    description: '+20 de vitesse de déplacement.',
    apply: (player) => {
      player.speed += 20;
    },
  },
  {
    id: 'range-up',
    rarity: 'common',
    label: 'Canon allongé',
    description: '+60 de portée de tir.',
    apply: (player) => {
      player.bulletRange += 60;
    },
  },
  {
    id: 'hp-up',
    rarity: 'common',
    label: 'Constitution',
    description: '+30 PV max (soignés).',
    apply: (player) => {
      player.maxHp += 30;
      player.hp += 30;
    },
  },
  {
    id: 'rifle-overclock',
    rarity: 'common',
    label: 'Culasse huilée',
    description: 'Fusil : +18 % de cadence.',
    weaponId: 'rifle',
    isEligible: (player) => player.activeWeaponId === 'rifle',
    apply: (player) => {
      weaponUpgrade(player, 'rifle').fireRateMultiplier *= 0.82;
    },
  },
  // ── rare ──────────────────────────────────────────────────────────────────
  {
    id: 'multishot',
    rarity: 'rare',
    label: 'Salve',
    description: '+25 % de chance de tir multiple.',
    apply: (player) => {
      player.multishotChance += 0.25;
    },
  },
  {
    id: 'pierce',
    rarity: 'rare',
    label: 'Perforation',
    description: 'Les balles traversent 1 ennemi de plus.',
    apply: (player) => {
      player.pierce += 1;
    },
  },
  {
    id: 'bullet-speed',
    rarity: 'rare',
    label: 'Poudre vive',
    description: '+120 de vitesse de balle.',
    apply: (player) => {
      player.bulletSpeed += 120;
      player.bulletSpeedBonusApplied = true;
    },
  },
  {
    id: 'pickup',
    rarity: 'rare',
    label: 'Aimant à ferraille',
    description: '+30 de rayon de ramassage.',
    apply: (player) => {
      player.pickupRadius += 30;
    },
  },
  {
    id: 'crit',
    rarity: 'rare',
    label: 'Point faible',
    description: '+10 % de chance de coup critique.',
    apply: (player) => {
      player.critChance += 0.1;
    },
  },
  {
    id: 'shotgun-choke',
    rarity: 'rare',
    label: 'Étranglement forgé',
    description: 'Tromblon : gerbe 35 % plus serrée et +12 % dégâts.',
    weaponId: 'shotgun',
    isEligible: (player) => player.activeWeaponId === 'shotgun',
    apply: (player) => {
      const weapon = weaponUpgrade(player, 'shotgun');
      weapon.spreadMultiplier *= 0.65;
      weapon.damageMultiplier *= 1.12;
    },
  },
  // ── epic ──────────────────────────────────────────────────────────────────
  {
    id: 'bounce',
    rarity: 'epic',
    label: 'Ricochet',
    description: 'Les balles rebondissent 1 fois de plus.',
    apply: (player) => {
      player.bounce += 1;
    },
  },
  {
    id: 'burn',
    rarity: 'epic',
    label: 'Munitions incendiaires',
    description: '+1 pile de brûlure par impact.',
    apply: (player) => {
      player.burnStacks += 1;
    },
  },
  {
    id: 'caliber',
    rarity: 'epic',
    label: 'Gros calibre',
    description: '+3 de rayon de balle.',
    apply: (player) => {
      player.bulletRadius += 3;
    },
  },
  {
    id: 'lifesteal',
    rarity: 'epic',
    label: 'Sangsue',
    description: '+5 % de vol de vie.',
    apply: (player) => {
      player.lifestealPct += 0.05;
    },
  },
  {
    id: 'marksman-calibration',
    rarity: 'epic',
    label: 'Lunette calibrée',
    description: 'Longue-vue : +25 % dégâts et +1 perforation.',
    weaponId: 'marksman',
    isEligible: (player) => player.activeWeaponId === 'marksman',
    apply: (player) => {
      const weapon = weaponUpgrade(player, 'marksman');
      weapon.damageMultiplier *= 1.25;
      weapon.pierceBonus += 1;
    },
  },
  // ── legendary ─────────────────────────────────────────────────────────────
  {
    id: 'aura',
    rarity: 'legendary',
    label: 'Aura brûlante',
    description: 'Aura de dégâts (20 dps, rayon 140).',
    apply: (player) => {
      player.auraDps += 20;
      player.auraRadius = Math.max(player.auraRadius, 140);
    },
  },
  {
    id: 'explode',
    rarity: 'legendary',
    label: 'Détonation',
    description: 'Les ennemis explosent à leur mort.',
    apply: (player) => {
      player.explodeOnKill = true;
    },
  },
  {
    id: 'big-dmg',
    rarity: 'legendary',
    label: 'Charge lourde',
    description: '+50 % de dégâts.',
    apply: (player) => {
      player.bulletDamage *= 1.5;
    },
  },
  // ── mythic ────────────────────────────────────────────────────────────────
  {
    id: 'growing',
    rarity: 'mythic',
    label: 'Balle grossissante',
    description: 'Les balles grossissent en vol.',
    apply: (player) => {
      player.growingBullet += 60;
    },
  },
  {
    id: 'crit-slow',
    rarity: 'mythic',
    label: 'Fracture glaciale',
    description: 'Les coups critiques ralentissent (+1 pile).',
    apply: (player) => {
      player.critSlowStacks += 1;
    },
  },
  // ── divin ─────────────────────────────────────────────────────────────────
  {
    id: 'omni',
    rarity: 'divin',
    label: 'Bénédiction',
    description: '+30 % dégâts, +10 % cadence, +1 perforation.',
    apply: (player) => {
      player.bulletDamage *= 1.3;
      player.fireRate = Math.max(MIN_FIRE_RATE, player.fireRate * 0.9);
      player.pierce += 1;
    },
  },
];

const CATALOG_BY_ID = new Map<string, UpgradeCardDefinition>(
  UPGRADE_CATALOG.map((card) => [card.id, card]),
);

export function getUpgradeById(id: string): UpgradeCardDefinition | undefined {
  return CATALOG_BY_ID.get(id);
}

const CATALOG_BY_RARITY = new Map<UpgradeRarity, UpgradeCardDefinition[]>();
for (const card of UPGRADE_CATALOG) {
  const bucket = CATALOG_BY_RARITY.get(card.rarity);
  if (bucket === undefined) {
    CATALOG_BY_RARITY.set(card.rarity, [card]);
  } else {
    bucket.push(card);
  }
}

export function getUpgradesByRarity(rarity: UpgradeRarity): readonly UpgradeCardDefinition[] {
  return CATALOG_BY_RARITY.get(rarity) ?? [];
}
