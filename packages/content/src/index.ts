import { z } from 'zod';

import { rawDefaultContent } from './default-content.js';

const positiveNumber = z.number().finite().positive();
const nonNegativeNumber = z.number().finite().nonnegative();

const ringSchema = z
  .object({
    minimumRadius: positiveNumber,
    maximumRadius: positiveNumber,
  })
  .refine((ring) => ring.minimumRadius < ring.maximumRadius, {
    message: 'minimumRadius doit être inférieur à maximumRadius',
    path: ['minimumRadius'],
  });

const resourceDefinitionSchema = z
  .object({
    /** Durée du canal de récolte d'une unité. */
    harvestDurationMs: positiveNumber,
    /** Temps pour regagner `regenAmount` unité(s) sur un gisement. */
    regenIntervalMs: positiveNumber,
    regenAmount: z.number().int().min(1),
    maxPerNode: z.number().int().min(1),
    nodeCount: z.number().int().min(1).max(20),
    /**
     * Distance minimale au village en deçà de laquelle aucun gisement de ce type
     * ne peut apparaître. Chaque gisement est ensuite tiré à un angle uniforme et
     * un rayon uniforme entre ce seuil et le bord de la carte (ou `maxDistanceFromVillage`).
     */
    minDistanceFromVillage: positiveNumber,
    /** Plafond optionnel de distance au village (sinon jusqu'au bord de la carte). */
    maxDistanceFromVillage: positiveNumber.optional(),
    /** Multiplicateur des stats du gardien de base pour ce type. */
    guardianStatScale: z.object({ hp: positiveNumber, damage: positiveNumber }),
    /** Couleur d'affichage, entier hexadécimal (ex 0x8a6a3f). */
    color: z.number().int().nonnegative(),
  })
  .refine(
    (definition) =>
      definition.maxDistanceFromVillage === undefined ||
      definition.minDistanceFromVillage < definition.maxDistanceFromVillage,
    {
      message: 'minDistanceFromVillage doit être inférieur à maxDistanceFromVillage',
      path: ['minDistanceFromVillage'],
    },
  );

const enemySchema = z.object({
  maxHp: positiveNumber,
  damage: positiveNumber,
  speed: nonNegativeNumber,
  attackRange: positiveNumber,
  attackCooldownMs: positiveNumber,
  experience: nonNegativeNumber,
  /** Bois laissé à la mort. Rend la ressource récupérable en défendant. */
  woodReward: z.number().int().nonnegative(),
});

const upgradeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  discipline: z.enum(['sword', 'barrier']),
  effect: z.enum([
    'sword-damage',
    'sword-speed',
    'sword-range',
    'lunge-cooldown',
    'ward-capacity',
    'barrier-duration',
  ]),
  value: positiveNumber,
  weight: positiveNumber,
});

export const gameContentSchema = z
  .object({
    version: z.literal(1),
    simulation: z.object({
      tickMs: z.number().int().min(16).max(100),
      dayDurationMs: positiveNumber,
      nightDurationMs: positiveNumber,
      finalDurationMs: positiveNumber,
    }),
    world: z.object({
      width: z.number().int().min(1000),
      height: z.number().int().min(1000),
      resources: z.object({
        wood: resourceDefinitionSchema,
        stone: resourceDefinitionSchema,
        iron: resourceDefinitionSchema,
        gold: resourceDefinitionSchema,
        diamond: resourceDefinitionSchema,
      }),
      initialSleeperCount: z.number().int().min(1).max(50),
      playerStartOffsetY: nonNegativeNumber,
      guardianOffset: positiveNumber,
      initialSleeperRing: ringSchema,
      debugEnemySpawnRing: ringSchema,
    }),
    player: z.object({
      maxHp: positiveNumber,
      moveSpeed: positiveNumber,
      interactionRange: positiveNumber,
    }),
    heal: z.object({
      buffDurationMs: positiveNumber,
      cooldownMs: positiveNumber,
      lifestealFraction: z.number().min(0).max(1),
    }),
    sword: z.object({
      autoDamage: positiveNumber,
      autoRange: positiveNumber,
      autoCooldownMs: positiveNumber,
      lungeDamage: positiveNumber,
      lungeDistance: positiveNumber,
      lungeRadius: positiveNumber,
      lungeCooldownMs: positiveNumber,
      lungeWakeRadius: positiveNumber,
      automaticAttackWakeRadius: positiveNumber,
    }),
    barrier: z.object({
      maxWard: positiveNumber,
      wardRefreshMs: positiveNumber,
      activeRadius: positiveNumber,
      activeDurationMs: positiveNumber,
      activeCooldownMs: positiveNumber,
      damageReduction: z.number().min(0).max(0.95),
    }),
    village: z.object({
      maxHp: positiveNumber,
      areaRadius: positiveNumber,
      dayRegenPerSecond: nonNegativeNumber,
      underAttackRegenMultiplier: z.number().finite().min(0).max(1),
      levelTwoCost: z.number().int().min(1),
      ultimateCost: z.number().int().min(1),
      ultimateMinimumPlayerLevel: z.number().int().min(1),
    }),
    defense: z.object({
      buildCost: z.number().int().min(1),
      buildDurationMs: positiveNumber,
      minimumHeartDistance: positiveNumber,
      minimumSpacing: positiveNumber,
      maxHp: positiveNumber,
      damage: positiveNumber,
      range: positiveNumber,
      cooldownMs: positiveNumber,
      repairCost: z.number().int().min(1),
      repairAmount: positiveNumber,
      placementOuterMargin: nonNegativeNumber,
    }),
    progression: z.object({
      experiencePerLevel: z.array(z.number().int().positive()).min(1),
      fallbackExperienceToNext: z.number().int().positive(),
      upgradeChoiceCount: z.number().int().min(1),
    }),
    enemies: z.object({
      guardian: enemySchema,
      sleeper: enemySchema,
      raider: enemySchema,
      brute: enemySchema,
    }),
    enemyBehavior: z.object({
      collisionRadius: positiveNumber,
      guardianAggroRange: positiveNumber,
      guardianChaseRange: positiveNumber,
      guardianReturnTolerance: nonNegativeNumber,
      dayAggroRange: positiveNumber,
      dayChaseRange: positiveNumber,
      dayReturnTolerance: nonNegativeNumber,
      assaultPlayerPriorityRange: positiveNumber,
      assaultDefenseDetectionRange: positiveNumber,
      defenseContactPadding: nonNegativeNumber,
      villageContactPadding: nonNegativeNumber,
    }),
    waves: z.object({
      night: z.object({
        baseRaiderCount: z.number().int().nonnegative(),
        raidersPerCycle: z.number().int().nonnegative(),
        bruteStartCycle: z.number().int().min(1),
        bruteBaseCount: z.number().int().nonnegative(),
        brutesPerCycle: z.number().int().nonnegative(),
        spawnRing: ringSchema,
      }),
      // Mise à l'échelle par cycle des assaillants générés. Le cycle 1 vaut ×1.
      escalation: z.object({
        hpPerCycle: nonNegativeNumber,
        damagePerCycle: nonNegativeNumber,
      }),
      dayReinforcements: z.object({
        baseCount: z.number().int().nonnegative(),
        countPerCycle: z.number().int().nonnegative(),
        maximumCount: z.number().int().nonnegative(),
        spawnRing: ringSchema,
      }),
      final: z.object({
        raiderCount: z.number().int().nonnegative(),
        raiderSpawnRing: ringSchema,
        bruteCount: z.number().int().nonnegative(),
        bruteSpawnRing: ringSchema,
      }),
      /**
       * Mise à l'échelle multijoueur : facteur ADDITIONNEL par joueur au-delà du
       * premier (`playerCount = 1` ⇒ aucun effet). Appliqué au nombre d'assaillants
       * générés par vague (nuit, renforts diurnes, vague finale) et, pour les
       * assauts (nuit/finale), à une légère hausse de leurs PV/dégâts.
       */
      perPlayerScaling: z.object({
        /** Facteur additionnel appliqué au NOMBRE d'assaillants par joueur supplémentaire. */
        enemyCountPerPlayer: nonNegativeNumber,
        /** Facteur additionnel appliqué aux PV/dégâts des assaillants par joueur supplémentaire. */
        enemyStatPerPlayer: nonNegativeNumber,
      }),
    }),
    upgrades: z.array(upgradeSchema).min(3),
  })
  .superRefine((content, context) => {
    const ids = new Set<string>();
    for (const upgrade of content.upgrades) {
      if (ids.has(upgrade.id)) {
        context.addIssue({
          code: 'custom',
          path: ['upgrades', upgrade.id],
          message: `identifiant d'amélioration dupliqué: ${upgrade.id}`,
        });
      }
      ids.add(upgrade.id);
    }
    if (content.progression.upgradeChoiceCount > content.upgrades.length) {
      context.addIssue({
        code: 'custom',
        path: ['progression', 'upgradeChoiceCount'],
        message: "ne peut pas dépasser le nombre d'améliorations disponibles",
      });
    }
    // Le bois statique doit à lui seul couvrir le chemin obligatoire de victoire :
    // une baliste, l'éveil du Foyer et l'activation finale. Sans cette garantie, un
    // joueur pourrait épuiser la ressource finie avant de pouvoir gagner.
    const wood = content.world.resources.wood;
    const staticWood = wood.nodeCount * wood.maxPerNode;
    const mandatoryWood =
      content.defense.buildCost + content.village.levelTwoCost + content.village.ultimateCost;
    if (staticWood < mandatoryWood) {
      context.addIssue({
        code: 'custom',
        path: ['world', 'resources', 'wood', 'maxPerNode'],
        message: `le bois statique (${staticWood}) doit couvrir le coût obligatoire de victoire (${mandatoryWood})`,
      });
    }
    // Les seuils de rareté sont strictement croissants : fer < or < diamant. Le bois
    // et la pierre partagent la même marge de sécurité proche du village.
    const resources = content.world.resources;
    const orderedThresholds: readonly [string, number][] = [
      ['iron', resources.iron.minDistanceFromVillage],
      ['gold', resources.gold.minDistanceFromVillage],
      ['diamond', resources.diamond.minDistanceFromVillage],
    ];
    for (let index = 0; index + 1 < orderedThresholds.length; index += 1) {
      const [innerName, innerValue] = orderedThresholds[index]!;
      const [outerName, outerValue] = orderedThresholds[index + 1]!;
      if (innerValue >= outerValue) {
        context.addIssue({
          code: 'custom',
          path: ['world', 'resources', outerName, 'minDistanceFromVillage'],
          message: `${outerName} doit apparaître plus loin que ${innerName} (${innerValue})`,
        });
      }
    }
    // Chaque seuil minimal doit laisser une bande plaçable avant le bord de la carte.
    const halfMap = Math.min(content.world.width, content.world.height) / 2;
    for (const [name, threshold] of orderedThresholds) {
      if (threshold >= halfMap) {
        context.addIssue({
          code: 'custom',
          path: ['world', 'resources', name, 'minDistanceFromVillage'],
          message: `le seuil (${threshold}) doit rester à l'intérieur de la carte (demi-carte ${halfMap})`,
        });
      }
    }
    // Le bois et la pierre ne doivent jamais apparaître dans la zone du village.
    for (const surfaceType of ['wood', 'stone'] as const) {
      if (resources[surfaceType].minDistanceFromVillage <= content.village.areaRadius) {
        context.addIssue({
          code: 'custom',
          path: ['world', 'resources', surfaceType, 'minDistanceFromVillage'],
          message: `${surfaceType} doit apparaître au-delà de la zone du village (${content.village.areaRadius})`,
        });
      }
    }
  });

export type GameContent = z.infer<typeof gameContentSchema>;
export type UpgradeDefinition = GameContent['upgrades'][number];
export type ResourceDefinition = z.infer<typeof resourceDefinitionSchema>;

export function parseGameContent(input: unknown, source = 'contenu en mémoire'): GameContent {
  const result = gameContentSchema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'racine'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Contenu de jeu invalide (${source}):\n${details}`);
  }
  return result.data;
}

export const defaultContent: GameContent = parseGameContent(
  rawDefaultContent,
  'packages/content/src/default-content.ts',
);
