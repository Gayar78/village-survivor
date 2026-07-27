import { defaultContent } from '@village-survivor/content';
import type { PlayerInput, PublicGameState, ResourceType } from '@village-survivor/protocol';
import { INVENTORY_SIZE, PLAYER_STACK_SIZE } from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import { GameSimulation } from '../src/index.js';
import { nightSpawnInstructions } from '../src/phase-system.js';

function input(sequence: number, overrides: Partial<PlayerInput> = {}): PlayerInput {
  return {
    sequence,
    moveX: 0,
    moveY: 0,
    ...overrides,
  };
}

function finishConstruction(simulation: GameSimulation, sequence: number): number {
  const ticks = defaultContent.defense.buildDurationMs / defaultContent.simulation.tickMs;
  for (let tick = 0; tick < ticks; tick += 1) {
    simulation.step(input(sequence++));
  }
  return sequence;
}

function clearGuardians(simulation: GameSimulation): void {
  for (const resource of simulation.createSnapshot().resources) {
    simulation.defeatEnemy(resource.guardianId);
  }
}

/**
 * Neutralise TOUT ennemi présent (gardiens compris), pas seulement les
 * assaillants nocturnes : un gardien voisin (d'un autre gisement, y compris
 * d'un autre palier de ressource) peut s'approcher et attaquer le joueur
 * pendant une boucle de récolte isolée, ce que `defeatAllAssailants` seul ne
 * couvre pas puisqu'il épargne les gardiens.
 */
function clearAllHostiles(simulation: GameSimulation): void {
  simulation.defeatAllAssailants();
  for (const enemy of simulation.createSnapshot().enemies) {
    simulation.defeatEnemy(enemy.id);
  }
}

/** Quantité totale d'un type dans un inventaire de snapshot (joueur ou village). */
function inventoryCount(
  inventory: PublicGameState['player']['inventory'],
  resourceType: ResourceType,
): number {
  return inventory.reduce(
    (total, slot) =>
      slot !== undefined && slot.resourceType === resourceType ? total + slot.quantity : total,
    0,
  );
}

/** Quantité totale toutes ressources confondues d'un inventaire de snapshot. */
function inventoryTotal(inventory: PublicGameState['player']['inventory']): number {
  return inventory.reduce((total, slot) => (slot !== undefined ? total + slot.quantity : total), 0);
}

function bagCount(simulation: GameSimulation, resourceType: ResourceType): number {
  return inventoryCount(simulation.createSnapshot().player.inventory, resourceType);
}

function bagTotal(simulation: GameSimulation): number {
  return inventoryTotal(simulation.createSnapshot().player.inventory);
}

function stockCount(simulation: GameSimulation, resourceType: ResourceType): number {
  return inventoryCount(simulation.createSnapshot().village.inventory, resourceType);
}

/**
 * Récolte UNE unité sur le gisement à portée puis rend la main : commence par un tick
 * `interact:false` (qui, avec l'auto-récolte engagée, poursuit simplement le canal en
 * cours) puis appuie sur `interact` jusqu'à ce que le sac gagne exactement une unité.
 * Renvoie le prochain numéro de séquence. Échoue si le canal ne se complète jamais.
 */
function harvestOneUnit(simulation: GameSimulation, sequenceStart: number): number {
  let sequence = sequenceStart;
  simulation.step(input(sequence++, { interact: false }));
  const before = bagTotal(simulation);
  let guard = 0;
  while (bagTotal(simulation) === before) {
    // Neutralise à chaque tick tout hostile (gardien voisin compris) qui
    // viendrait toucher le joueur : un coup encaissé annule le canal en cours
    // (comportement voulu), il ne faut donc pas laisser un ennemi errant
    // interrompre une boucle de test qui isole volontairement la récolte du combat.
    clearAllHostiles(simulation);
    simulation.step(input(sequence++, { interact: true }));
    guard += 1;
    if (guard > 60) {
      throw new Error('Le canal de récolte ne se complète jamais.');
    }
  }
  return sequence;
}

describe('GameSimulation', () => {
  it('creates a reproducible world and evolves deterministically', () => {
    const first = new GameSimulation(defaultContent, 'same-seed');
    const second = new GameSimulation(defaultContent, 'same-seed');
    first.start();
    second.start();

    for (let tick = 0; tick < 500; tick += 1) {
      const currentInput = input(tick, {
        moveX: Math.sin(tick / 20),
        moveY: Math.cos(tick / 20),
        aimX: 1,
        aimY: 0,
        activateBarrier: tick % 240 === 0,
        activateSword: tick % 100 === 0,
        ...(tick % 300 === 0 ? { activateHeal: true as const } : {}),
      });
      first.step(currentInput);
      second.step(currentInput);
      expect(first.createSnapshot()).toEqual(second.createSnapshot());
    }
  });

  it('uses the seed to produce different maps', () => {
    const first = new GameSimulation(defaultContent, 'map-a');
    const second = new GameSimulation(defaultContent, 'map-b');
    expect(first.createSnapshot().resources).not.toEqual(second.createSnapshot().resources);

    // La rotation globale de l'anneau doit produire une forte variation angulaire
    // d'une graine à l'autre, bien au-delà du seul jitter local (~0.3 rad).
    const firstResourceAngle = (seed: string): number => {
      const node = new GameSimulation(defaultContent, seed).createSnapshot().resources[0]!;
      return Math.atan2(node.position.y, node.position.x);
    };
    const angles = Array.from({ length: 12 }, (_, index) => firstResourceAngle(`spread-${index}`));
    const spread = Math.max(...angles) - Math.min(...angles);
    expect(spread).toBeGreaterThan(1);
  });

  it('moves from day to night at a fixed number of ticks', () => {
    const simulation = new GameSimulation(defaultContent, 'clock');
    simulation.start();
    const dayTicks = defaultContent.simulation.dayDurationMs / defaultContent.simulation.tickMs;
    for (let tick = 0; tick < dayTicks; tick += 1) {
      simulation.step(input(tick));
    }
    expect(simulation.createSnapshot().phase).toBe('night');
    expect(simulation.createSnapshot().cycle).toBe(1);
  });

  it('scatters the five resource types randomly while respecting per-type distance thresholds', () => {
    const order: ResourceType[] = ['wood', 'stone', 'iron', 'gold', 'diamond'];
    // Marge intérieure de carte codée dans generateWorld (bord jouable).
    const innerEdgeMargin = 100;
    const edgeRadius =
      Math.min(defaultContent.world.width, defaultContent.world.height) / 2 - innerEdgeMargin;

    const radiiByType = (seed: string, type: ResourceType): number[] =>
      new GameSimulation(defaultContent, seed)
        .createSnapshot()
        .resources.filter((resource) => resource.resourceType === type)
        .map((resource) => Math.hypot(resource.position.x, resource.position.y));

    const seeds = Array.from({ length: 8 }, (_, index) => `scatter-${index}`);

    for (const seed of seeds) {
      const snapshot = new GameSimulation(defaultContent, seed).createSnapshot();

      // (a) Le bon nombre de gisements par type : wood=10, stone=8, iron=5, gold=2, diamond=1.
      for (const type of order) {
        const nodes = snapshot.resources.filter((resource) => resource.resourceType === type);
        expect(nodes).toHaveLength(defaultContent.world.resources[type].nodeCount);
      }

      // (b) Chaque gisement respecte le seuil minimal de son type et reste dans la carte.
      for (const type of order) {
        const definition = defaultContent.world.resources[type];
        for (const radius of radiiByType(seed, type)) {
          expect(radius).toBeGreaterThanOrEqual(definition.minDistanceFromVillage - 1e-6);
          expect(radius).toBeLessThanOrEqual(edgeRadius + 1e-6);
          // Aucun gisement dans la zone du village.
          expect(radius).toBeGreaterThan(defaultContent.village.areaRadius);
        }
      }
    }

    // (c) Les seuils minimaux sont strictement croissants pour la rareté : fer < or < diamant,
    // et bois/pierre partagent la marge de sécurité du village.
    const r = defaultContent.world.resources;
    expect(r.wood.minDistanceFromVillage).toBe(r.stone.minDistanceFromVillage);
    expect(r.wood.minDistanceFromVillage).toBeGreaterThan(defaultContent.village.areaRadius);
    expect(r.iron.minDistanceFromVillage).toBeLessThan(r.gold.minDistanceFromVillage);
    expect(r.gold.minDistanceFromVillage).toBeLessThan(r.diamond.minDistanceFromVillage);

    // (d) Le placement est bien aléatoire : les rayons de bois varient d'une graine à l'autre.
    const woodFirstRadii = seeds.map((seed) => radiiByType(seed, 'wood')[0]!);
    expect(new Set(woodFirstRadii.map((radius) => radius.toFixed(2))).size).toBeGreaterThan(1);

    // Les gardiens ont des stats croissantes dans le même ordre.
    const snapshot = new GameSimulation(defaultContent, 'guardian-scale').createSnapshot();
    const guardianHp = (type: ResourceType): number => {
      const node = snapshot.resources.find((resource) => resource.resourceType === type)!;
      const guardian = snapshot.enemies.find((enemy) => enemy.id === node.guardianId)!;
      return guardian.maxHp;
    };
    const hps = order.map(guardianHp);
    for (let index = 0; index + 1 < hps.length; index += 1) {
      expect(hps[index]!).toBeLessThan(hps[index + 1]!);
    }
  });

  it('completes a harvest channel after the resource harvest duration and fills a bag slot', () => {
    const simulation = new GameSimulation(defaultContent, 'harvest-channel');
    simulation.start();
    const wood = defaultContent.world.resources.wood;
    const node = simulation.createSnapshot().resources.find((r) => r.resourceType === 'wood')!;
    simulation.defeatEnemy(node.guardianId);
    simulation.teleportPlayer(node.position);
    // Isole la boucle de récolte de tout dormeur errant qui pourrait annuler le canal.
    simulation.defeatAllAssailants();
    const amountBefore = simulation
      .createSnapshot()
      .resources.find((r) => r.id === node.id)!.amountRemaining;

    let sequence = 1;
    let ticks = 0;
    while (bagTotal(simulation) === 0) {
      simulation.step(input(sequence++, { interact: true }));
      ticks += 1;
      // À mi-parcours, le canal doit être visible et en cours de progression.
      if (ticks === 2) {
        const channel = simulation.createSnapshot().player.interactionChannel;
        expect(channel).toBeDefined();
        expect(channel!.kind).toBe('harvest');
        expect(channel!.resourceType).toBe('wood');
        expect(channel!.progress).toBeGreaterThan(0);
      }
      if (ticks > 30) {
        throw new Error('Le canal de récolte ne se complète jamais.');
      }
    }

    // Un tick d'amorçage puis harvestDurationMs / tickMs ticks de charge.
    expect(ticks).toBe(wood.harvestDurationMs / defaultContent.simulation.tickMs + 1);
    expect(bagCount(simulation, 'wood')).toBe(1);
    expect(
      simulation.createSnapshot().resources.find((r) => r.id === node.id)!.amountRemaining,
    ).toBe(amountBefore - 1);
    // Auto-relance : le gisement ayant encore du stock, un nouveau canal démarre aussitôt
    // sur le même gisement sans nouvel appui (progression repartie de zéro).
    const relaunched = simulation.createSnapshot().player.interactionChannel;
    expect(relaunched).toBeDefined();
    expect(relaunched!.kind).toBe('harvest');
    expect(relaunched!.resourceType).toBe('wood');
  });

  it('cancels an in-progress harvest channel on movement', () => {
    const simulation = new GameSimulation(defaultContent, 'cancel-move');
    simulation.start();
    const node = simulation.createSnapshot().resources.find((r) => r.resourceType === 'stone')!;
    simulation.defeatEnemy(node.guardianId);
    simulation.teleportPlayer(node.position);
    simulation.defeatAllAssailants();
    let sequence = 1;

    simulation.step(input(sequence++, { interact: true }));
    simulation.step(input(sequence++, { interact: true }));
    expect(simulation.createSnapshot().player.interactionChannel).toBeDefined();

    // Un déplacement pendant que l'on maintient interact annule le canal.
    simulation.step(input(sequence, { interact: true, moveX: 1, moveY: 0 }));
    expect(simulation.createSnapshot().player.interactionChannel).toBeUndefined();
  });

  it('cancels an in-progress harvest channel when the player takes damage', () => {
    const simulation = new GameSimulation(defaultContent, 'cancel-damage');
    simulation.start();
    // Le diamant a le canal le plus long (8 s) : largement le temps de se faire toucher.
    const node = simulation.createSnapshot().resources.find((r) => r.resourceType === 'diamond')!;
    simulation.defeatEnemy(node.guardianId);
    simulation.teleportPlayer(node.position);
    simulation.spawnEnemy('raider', node.position);

    let sequence = 1;
    let hurtTick = -1;
    for (let tick = 0; tick < 80; tick += 1) {
      simulation.step(input(sequence++, { interact: true }));
      const snapshot = simulation.createSnapshot();
      if (snapshot.events.some((event) => event.type === 'player-hurt')) {
        hurtTick = tick;
        // Les dégâts subis ce tick annulent le canal.
        expect(snapshot.player.interactionChannel).toBeUndefined();
        break;
      }
    }
    expect(hurtTick).toBeGreaterThanOrEqual(0);
  });

  it('keeps auto-harvesting after a single interact press until the node is exhausted', () => {
    const simulation = new GameSimulation(defaultContent, 'auto-harvest');
    simulation.start();
    const wood = defaultContent.world.resources.wood;
    const node = simulation.createSnapshot().resources.find((r) => r.resourceType === 'wood')!;
    simulation.defeatEnemy(node.guardianId);
    simulation.teleportPlayer(node.position);
    simulation.defeatAllAssailants();

    // UN SEUL appui `interact`, puis le clic est relâché (interact:false) : la récolte
    // doit continuer toute seule, unité après unité, sans nouvel appui ni maintien.
    let sequence = 1;
    simulation.step(input(sequence++, { interact: true }));

    let guard = 0;
    while (
      simulation.createSnapshot().resources.find((r) => r.id === node.id)!.amountRemaining > 0
    ) {
      // Le clic n'est plus jamais renvoyé : on prouve que le maintien n'est pas requis.
      simulation.step(input(sequence++, { interact: false }));
      guard += 1;
      if (guard > 200) {
        throw new Error("L'auto-récolte ne vide jamais le gisement.");
      }
    }

    // Tout le gisement (maxPerNode) a été récolté d'un seul appui, dans le sac du joueur.
    expect(bagCount(simulation, 'wood')).toBe(wood.maxPerNode);
    // Gisement vidé : l'engagement retombe et plus aucun canal n'est actif.
    const state = simulation.createSnapshot();
    expect(state.resources.find((r) => r.id === node.id)!.amountRemaining).toBe(0);
    expect(state.player.interactionChannel).toBeUndefined();

    // Sans nouvel appui, aucune récolte ne reprend même une fois une unité repoussée.
    const regenTicks = Math.ceil(wood.regenIntervalMs / defaultContent.simulation.tickMs);
    for (let tick = 0; tick < regenTicks + 2; tick += 1) {
      simulation.step(input(sequence++, { interact: false }));
    }
    expect(simulation.createSnapshot().player.interactionChannel).toBeUndefined();
    expect(bagCount(simulation, 'wood')).toBe(wood.maxPerNode);
  });

  it('drops the auto-harvest commitment when the player moves, needing a fresh press', () => {
    const simulation = new GameSimulation(defaultContent, 'auto-harvest-move');
    simulation.start();
    const node = simulation.createSnapshot().resources.find((r) => r.resourceType === 'stone')!;
    simulation.defeatEnemy(node.guardianId);
    simulation.teleportPlayer(node.position);
    simulation.defeatAllAssailants();

    let sequence = 1;
    // Engage la récolte puis relâche : elle tourne toute seule.
    simulation.step(input(sequence++, { interact: true }));
    simulation.step(input(sequence++, { interact: false }));
    expect(simulation.createSnapshot().player.interactionChannel).toBeDefined();

    // Un déplacement annule le canal ET lève l'engagement.
    simulation.step(input(sequence++, { moveX: 1, moveY: 0 }));
    expect(simulation.createSnapshot().player.interactionChannel).toBeUndefined();

    // Le seul relâchement (sans nouvel appui) ne relance rien : il faut recliquer.
    simulation.step(input(sequence++, { interact: false }));
    expect(simulation.createSnapshot().player.interactionChannel).toBeUndefined();
    simulation.step(input(sequence, { interact: true }));
    expect(simulation.createSnapshot().player.interactionChannel).toBeDefined();
  });

  it('regrows harvested nodes over time, capped at maxPerNode', () => {
    const simulation = new GameSimulation(defaultContent, 'node-regen');
    simulation.start();
    const wood = defaultContent.world.resources.wood;
    const node = simulation.createSnapshot().resources.find((r) => r.resourceType === 'wood')!;
    simulation.defeatEnemy(node.guardianId);
    simulation.teleportPlayer(node.position);
    simulation.defeatAllAssailants();

    let sequence = harvestOneUnit(simulation, 1);
    sequence = harvestOneUnit(simulation, sequence);
    const lowered = simulation
      .createSnapshot()
      .resources.find((r) => r.id === node.id)!.amountRemaining;
    expect(lowered).toBeLessThan(wood.maxPerNode);

    // On éloigne le joueur du gisement : sinon l'auto-récolte engagée continuerait de
    // le vider pendant qu'on observe uniquement la repousse (indépendante du joueur).
    simulation.teleportPlayer(simulation.createSnapshot().village.position);

    const regenTicks = Math.ceil(wood.regenIntervalMs / defaultContent.simulation.tickMs);
    for (let tick = 0; tick < regenTicks; tick += 1) {
      simulation.step(input(sequence++));
    }
    const afterOne = simulation
      .createSnapshot()
      .resources.find((r) => r.id === node.id)!.amountRemaining;
    expect(afterOne).toBe(Math.min(wood.maxPerNode, lowered + wood.regenAmount));

    // Une très longue avance sature au plafond sans jamais le dépasser.
    for (let tick = 0; tick < regenTicks * 40; tick += 1) {
      simulation.step(input(sequence++));
    }
    expect(
      simulation.createSnapshot().resources.find((r) => r.id === node.id)!.amountRemaining,
    ).toBe(wood.maxPerNode);
  });

  it('transfers resources between the bag and the village stock slot by slot', () => {
    const simulation = new GameSimulation(defaultContent, 'inventory-transfer');
    simulation.start();
    const state = simulation.createSnapshot();
    const node = state.resources.find((r) => r.resourceType === 'wood')!;
    simulation.defeatEnemy(node.guardianId);
    simulation.teleportPlayer(node.position);
    simulation.defeatAllAssailants();

    // Neuf unités : une pile pleine (8) + une pile de 1 dans une seconde case.
    let sequence = 1;
    for (let unit = 0; unit < 9; unit += 1) {
      sequence = harvestOneUnit(simulation, sequence);
    }
    expect(bagCount(simulation, 'wood')).toBe(9);
    const occupied = simulation
      .createSnapshot()
      .player.inventory.filter((slot) => slot !== undefined).length;
    expect(occupied).toBe(2);

    // Rompt l'auto-récolte engagée (un pas de déplacement l'annule) pour observer les
    // transferts d'inventaire sans que le gisement voisin ne se vide en arrière-plan.
    simulation.step(input(sequence++, { moveX: 1, moveY: 0 }));
    simulation.teleportPlayer(node.position);

    // (a) hors de la zone du village : depositSlot est un no-op.
    simulation.step(input(sequence++, { depositSlot: 0 }));
    expect(bagTotal(simulation)).toBe(9);
    expect(stockCount(simulation, 'wood')).toBe(0);

    simulation.teleportPlayer(state.village.position);

    // (b) index de case invalide : no-op.
    simulation.step(input(sequence++, { depositSlot: 99 }));
    expect(bagTotal(simulation)).toBe(9);
    expect(stockCount(simulation, 'wood')).toBe(0);

    // (c) depositSlot transfère la pile ENTIÈRE de la case et la vide côté joueur.
    simulation.step(input(sequence++, { depositSlot: 0 }));
    expect(simulation.createSnapshot().player.inventory[0]).toBeUndefined();
    expect(bagCount(simulation, 'wood')).toBe(1);
    expect(stockCount(simulation, 'wood')).toBe(8);
    expect(
      simulation.createSnapshot().events.some((event) => event.type === 'resource-deposited'),
    ).toBe(true);

    // (d) withdrawSlot rapatrie jusqu'à PLAYER_STACK_SIZE, clampé par la place restante.
    // La case joueur a déjà 1 bois (place = 7), donc 7 unités sont retirées.
    simulation.step(input(sequence++, { withdrawSlot: 0 }));
    expect(bagCount(simulation, 'wood')).toBe(8);
    expect(stockCount(simulation, 'wood')).toBe(1);
    expect(
      simulation.createSnapshot().events.some((event) => event.type === 'resource-withdrawn'),
    ).toBe(true);

    // (e) depositAll vide toutes les piles occupées du joueur d'un coup.
    simulation.step(input(sequence++, { depositAll: true }));
    expect(bagTotal(simulation)).toBe(0);
    expect(stockCount(simulation, 'wood')).toBe(9);

    // (f) depositAll hors zone village : no-op même avec un sac non vide.
    simulation.giveResources(5);
    simulation.step(input(sequence++, { withdrawSlot: 0 }));
    expect(bagCount(simulation, 'wood')).toBe(8);
    simulation.teleportPlayer(node.position);
    const stockBefore = stockCount(simulation, 'wood');
    simulation.step(input(sequence, { depositAll: true }));
    expect(bagCount(simulation, 'wood')).toBe(8);
    expect(stockCount(simulation, 'wood')).toBe(stockBefore);
  });

  it('blocks harvesting once every bag slot is occupied', () => {
    const simulation = new GameSimulation(defaultContent, 'full-bag');
    simulation.start();
    simulation.teleportPlayer(simulation.createSnapshot().village.position);
    // Remplit les 20 cases via des retraits successifs du stock village (20 x 8 = 160).
    simulation.giveResources(INVENTORY_SIZE * PLAYER_STACK_SIZE);
    let sequence = 1;
    for (let slot = 0; slot < INVENTORY_SIZE; slot += 1) {
      simulation.step(input(sequence++, { withdrawSlot: 0 }));
    }
    const filled = simulation.createSnapshot().player.inventory;
    expect(filled.every((slot) => slot !== undefined)).toBe(true);
    expect(inventoryTotal(filled)).toBe(INVENTORY_SIZE * PLAYER_STACK_SIZE);

    const node = simulation.createSnapshot().resources.find((r) => r.resourceType === 'wood')!;
    simulation.defeatEnemy(node.guardianId);
    simulation.teleportPlayer(node.position);
    const amountBefore = simulation
      .createSnapshot()
      .resources.find((r) => r.id === node.id)!.amountRemaining;

    for (let tick = 0; tick < 12; tick += 1) {
      simulation.step(input(sequence++, { interact: true }));
    }
    // Sac plein : aucun canal ne démarre et le gisement n'est pas entamé.
    expect(simulation.createSnapshot().player.interactionChannel).toBeUndefined();
    expect(bagTotal(simulation)).toBe(INVENTORY_SIZE * PLAYER_STACK_SIZE);
    expect(
      simulation.createSnapshot().resources.find((r) => r.id === node.id)!.amountRemaining,
    ).toBe(amountBefore);
  });

  it('heals the player through the lifesteal buff while it is active', () => {
    const simulation = new GameSimulation(defaultContent, 'heal-active');
    simulation.start();
    simulation.teleportPlayer({ x: 1_000, y: 0 });
    simulation.defeatAllAssailants();
    // Ennemi derrière le joueur (côté -x) : la fente l'atteint puis le joueur s'en éloigne.
    simulation.spawnEnemy('raider', { x: 940, y: 0 });
    simulation.damagePlayer(50);

    // Tick A : arme la fenêtre de soin (sans dégât infligé ce tick).
    simulation.step(input(1, { activateHeal: true }));
    const hpBefore = simulation.createSnapshot().player.hp;
    expect(simulation.createSnapshot().player.heal.buffRemainingMs).toBeGreaterThan(0);
    expect(simulation.createSnapshot().player.heal.cooldownRemainingMs).toBeGreaterThan(0);

    // Tick B : fente vers -x, touche l'ennemi et vole de la vie.
    simulation.step(input(2, { activateSword: true, aimX: -1, aimY: 0 }));
    const hpAfter = simulation.createSnapshot().player.hp;
    const expectedHeal = defaultContent.sword.lungeDamage * defaultContent.heal.lifestealFraction;
    expect(hpAfter - hpBefore).toBeCloseTo(expectedHeal, 5);

    // Le cooldown empêche une réactivation immédiate : le buff n'est pas rechargé.
    const buffBefore = simulation.createSnapshot().player.heal.buffRemainingMs;
    simulation.step(input(3, { activateHeal: true }));
    const buffAfter = simulation.createSnapshot().player.heal.buffRemainingMs;
    expect(buffAfter).toBeLessThan(defaultContent.heal.buffDurationMs);
    expect(buffAfter).toBeLessThan(buffBefore);
    expect(simulation.createSnapshot().player.heal.cooldownRemainingMs).toBeGreaterThan(0);
  });

  it('stops lifesteal once the heal buff expires', () => {
    const simulation = new GameSimulation(defaultContent, 'heal-expiry');
    simulation.start();
    simulation.teleportPlayer({ x: 1_500, y: 0 });
    simulation.defeatAllAssailants();
    simulation.damagePlayer(50);

    simulation.step(input(1, { activateHeal: true }));
    const buffTicks = defaultContent.heal.buffDurationMs / defaultContent.simulation.tickMs;
    let sequence = 2;
    for (let tick = 0; tick <= buffTicks + 4; tick += 1) {
      simulation.step(input(sequence++));
    }
    const expired = simulation.createSnapshot().player;
    expect(expired.heal.buffRemainingMs).toBe(0);
    // Le cooldown court toujours : une réactivation est refusée.
    expect(expired.heal.cooldownRemainingMs).toBeGreaterThan(0);
    simulation.step(input(sequence++, { activateHeal: true }));
    expect(simulation.createSnapshot().player.heal.buffRemainingMs).toBe(0);

    // Une fente qui touche un ennemi ne rend plus aucun PV.
    simulation.spawnEnemy('raider', { x: 1_440, y: 0 });
    const hpBefore = simulation.createSnapshot().player.hp;
    simulation.step(input(sequence, { activateSword: true, aimX: -1, aimY: 0 }));
    expect(simulation.createSnapshot().player.hp).toBe(hpBefore);
  });

  it('supports the complete explore, build, defend and win loop', () => {
    const simulation = new GameSimulation(defaultContent, 'full-m1');
    simulation.start();
    let sequence = 0;

    const harvestAndStore = (nodeIndex: number, units: number): void => {
      const state = simulation.createSnapshot();
      const resource = state.resources[nodeIndex]!;
      simulation.defeatEnemy(resource.guardianId);
      simulation.teleportPlayer(resource.position);
      for (let unit = 0; unit < units; unit += 1) {
        // On neutralise tout hostile pour isoler la boucle de récolte du combat.
        clearAllHostiles(simulation);
        sequence = harvestOneUnit(simulation, sequence);
      }
      simulation.teleportPlayer(state.village.position);
      simulation.step(input(sequence++, { depositAll: true }));
      const choice = simulation.createSnapshot().upgradeChoices[0];
      if (choice !== undefined) {
        simulation.step(input(sequence++, { selectUpgradeId: choice.id }));
      }
    };

    // Réunit exactement les 26 bois obligatoires : baliste (6) + Foyer (8) + ultime (12).
    harvestAndStore(0, 10);
    harvestAndStore(1, 10);
    harvestAndStore(2, 6);
    expect(stockCount(simulation, 'wood')).toBeGreaterThanOrEqual(
      defaultContent.defense.buildCost +
        defaultContent.village.levelTwoCost +
        defaultContent.village.ultimateCost,
    );

    simulation.teleportPlayer({ x: 140, y: 0 });
    simulation.step(input(sequence++, { buildDefense: true }));
    sequence = finishConstruction(simulation, sequence);
    expect(simulation.createSnapshot().defenses[0]?.built).toBe(true);

    simulation.teleportPlayer(simulation.createSnapshot().village.position);
    simulation.step(input(sequence++, { upgradeHeart: true }));
    expect(simulation.createSnapshot().village.heartLevel).toBe(2);
    expect(simulation.createSnapshot().player.level).toBeGreaterThanOrEqual(2);

    simulation.step(input(sequence++, { upgradeHeart: true }));
    expect(simulation.createSnapshot().village.heartLevel).toBe(3);
    expect(simulation.createSnapshot().phase).toBe('final');

    simulation.defeatAllAssailants();
    const finalTicks = defaultContent.simulation.finalDurationMs / defaultContent.simulation.tickMs;
    for (let tick = 0; tick < finalTicks; tick += 1) {
      simulation.step(input(sequence++));
      if (tick % 40 === 0) {
        simulation.defeatAllAssailants();
      }
    }
    expect(simulation.createSnapshot().status).toBe('victory');
  });

  it('upgrades the village heart only through the explicit upgradeHeart input', () => {
    const simulation = new GameSimulation(defaultContent, 'heart-upgrade');
    simulation.start();
    simulation.teleportPlayer(simulation.createSnapshot().village.position);
    simulation.giveResources(defaultContent.village.levelTwoCost);
    let sequence = 1;

    // Un simple `interact` près du Cœur ne déclenche plus l'amélioration.
    simulation.step(input(sequence++, { interact: true }));
    expect(simulation.createSnapshot().village.heartLevel).toBe(1);

    // Le flag dédié l'améliore et débite le stock.
    simulation.step(input(sequence, { upgradeHeart: true }));
    const state = simulation.createSnapshot();
    expect(state.village.heartLevel).toBe(2);
    expect(stockCount(simulation, 'wood')).toBe(0);
    expect(state.events.some((event) => event.type === 'heart-upgraded')).toBe(true);
  });

  it('consumes exactly ultimateCost wood from the village stock on the level 2 -> 3 heart transition', () => {
    const simulation = new GameSimulation(defaultContent, 'heart-ultimate-exact');
    simulation.start();
    const village = simulation.createSnapshot().village;
    let sequence = 1;

    // Étape 1 : amène le Cœur au niveau 2 (coût déjà couvert par le test dédié ci-dessus).
    simulation.teleportPlayer(village.position);
    simulation.giveResources(defaultContent.village.levelTwoCost);
    simulation.step(input(sequence++, { upgradeHeart: true }));
    expect(simulation.createSnapshot().village.heartLevel).toBe(2);
    expect(stockCount(simulation, 'wood')).toBe(0);

    // Étape 2 : construit la baliste requise par `hasOperationalDefense()`.
    simulation.giveResources(defaultContent.defense.buildCost);
    simulation.teleportPlayer({ x: 140, y: 0 });
    simulation.step(input(sequence++, { buildDefense: true }));
    sequence = finishConstruction(simulation, sequence);
    expect(simulation.createSnapshot().defenses[0]?.built).toBe(true);

    // Étape 3 : satisfait le niveau de joueur minimal requis.
    simulation.giveExperience(1_000_000);
    expect(simulation.createSnapshot().player.level).toBeGreaterThanOrEqual(
      defaultContent.village.ultimateMinimumPlayerLevel,
    );

    // Étape 4 : donne EXACTEMENT ultimateCost bois, ni plus ni moins.
    simulation.giveResources(defaultContent.village.ultimateCost);
    expect(stockCount(simulation, 'wood')).toBe(defaultContent.village.ultimateCost);

    simulation.teleportPlayer(simulation.createSnapshot().village.position);
    simulation.step(input(sequence, { upgradeHeart: true }));

    const state = simulation.createSnapshot();
    expect(state.village.heartLevel).toBe(3);
    expect(stockCount(simulation, 'wood')).toBe(0);
    expect(state.phase).toBe('final');
    expect(state.events.some((event) => event.type === 'heart-upgraded')).toBe(true);
  });

  it('does not consume wood when the ultimate heart upgrade fails to trigger (missing side condition)', () => {
    // Cas A : bois suffisant mais pas de baliste opérationnelle.
    const noDefense = new GameSimulation(defaultContent, 'heart-ultimate-no-defense');
    noDefense.start();
    noDefense.teleportPlayer(noDefense.createSnapshot().village.position);
    noDefense.giveResources(defaultContent.village.levelTwoCost);
    let seq = 1;
    noDefense.step(input(seq++, { upgradeHeart: true }));
    expect(noDefense.createSnapshot().village.heartLevel).toBe(2);

    noDefense.giveExperience(1_000_000);
    noDefense.giveResources(defaultContent.village.ultimateCost);
    expect(stockCount(noDefense, 'wood')).toBe(defaultContent.village.ultimateCost);

    noDefense.step(input(seq, { upgradeHeart: true }));
    const noDefenseState = noDefense.createSnapshot();
    expect(noDefenseState.village.heartLevel).toBe(2);
    expect(stockCount(noDefense, 'wood')).toBe(defaultContent.village.ultimateCost);
    expect(noDefenseState.phase).not.toBe('final');

    // Cas B : bois suffisant et baliste bâtie, mais niveau de joueur insuffisant.
    const lowLevel = new GameSimulation(defaultContent, 'heart-ultimate-low-level');
    lowLevel.start();
    lowLevel.teleportPlayer(lowLevel.createSnapshot().village.position);
    lowLevel.giveResources(defaultContent.village.levelTwoCost);
    let sequence = 1;
    lowLevel.step(input(sequence++, { upgradeHeart: true }));
    expect(lowLevel.createSnapshot().village.heartLevel).toBe(2);

    lowLevel.giveResources(defaultContent.defense.buildCost);
    lowLevel.teleportPlayer({ x: 140, y: 0 });
    lowLevel.step(input(sequence++, { buildDefense: true }));
    sequence = finishConstruction(lowLevel, sequence);
    expect(lowLevel.createSnapshot().defenses[0]?.built).toBe(true);
    expect(lowLevel.createSnapshot().player.level).toBeLessThan(
      defaultContent.village.ultimateMinimumPlayerLevel,
    );

    lowLevel.giveResources(defaultContent.village.ultimateCost);
    expect(stockCount(lowLevel, 'wood')).toBe(defaultContent.village.ultimateCost);

    lowLevel.teleportPlayer(lowLevel.createSnapshot().village.position);
    lowLevel.step(input(sequence, { upgradeHeart: true }));
    const lowLevelState = lowLevel.createSnapshot();
    expect(lowLevelState.village.heartLevel).toBe(2);
    expect(stockCount(lowLevel, 'wood')).toBe(defaultContent.village.ultimateCost);
    expect(lowLevelState.phase).not.toBe('final');
  });

  it('publishes the origin and target of every ballista shot', () => {
    const simulation = new GameSimulation(defaultContent, 'ballista-shot');
    simulation.start();
    clearGuardians(simulation);
    simulation.giveResources(defaultContent.defense.buildCost);
    simulation.teleportPlayer({ x: 140, y: 0 });
    simulation.step(input(1, { buildDefense: true }));
    finishConstruction(simulation, 2);
    const defense = simulation.createSnapshot().defenses[0]!;
    simulation.spawnEnemy('raider', {
      x: defense.position.x + 100,
      y: defense.position.y,
    });

    simulation.step(input(200));
    const state = simulation.createSnapshot();
    const shot = state.events.find((event) => event.type === 'defense-fired');
    expect(shot?.origin).toEqual(defense.position);
    expect(shot?.position).toBeDefined();
  });

  it('builds several ballistas at player-chosen positions when resources allow it', () => {
    const simulation = new GameSimulation(defaultContent, 'several-ballistas');
    simulation.start();
    clearGuardians(simulation);
    simulation.giveResources(defaultContent.defense.buildCost * 2);
    let sequence = 1;

    simulation.teleportPlayer({ x: 140, y: 0 });
    simulation.step(input(sequence++, { buildDefense: true }));
    sequence = finishConstruction(simulation, sequence);
    simulation.teleportPlayer({ x: -140, y: 0 });
    simulation.step(input(sequence++, { buildDefense: true }));
    finishConstruction(simulation, sequence);

    const defenses = simulation.createSnapshot().defenses;
    expect(defenses).toHaveLength(2);
    expect(defenses.every((defense) => defense.built)).toBe(true);
    expect(defenses.map((defense) => defense.position)).toEqual([
      { x: 140, y: 0 },
      { x: -140, y: 0 },
    ]);
  });

  it('interrupts an active ballista build on damage and refunds its resources', () => {
    const simulation = new GameSimulation(defaultContent, 'interrupted-build');
    simulation.start();
    clearGuardians(simulation);
    simulation.giveResources(defaultContent.defense.buildCost);
    simulation.teleportPlayer({ x: 140, y: 0 });
    simulation.step(input(1, { buildDefense: true }));
    simulation.step(input(2));

    simulation.damagePlayer(1);

    const state = simulation.createSnapshot();
    expect(state.defenses).toHaveLength(0);
    expect(stockCount(simulation, 'wood')).toBe(defaultContent.defense.buildCost);
    expect(state.events.some((event) => event.type === 'defense-construction-interrupted')).toBe(
      true,
    );
  });

  it('pays a ballista from the bag when the village stock is short', () => {
    const simulation = new GameSimulation(defaultContent, 'bag-payment');
    simulation.start();
    const node = simulation.createSnapshot().resources.find((r) => r.resourceType === 'wood')!;
    simulation.defeatEnemy(node.guardianId);
    simulation.teleportPlayer(node.position);
    simulation.defeatAllAssailants();
    let sequence = 1;
    for (let unit = 0; unit < defaultContent.defense.buildCost; unit += 1) {
      sequence = harvestOneUnit(simulation, sequence);
    }
    expect(bagCount(simulation, 'wood')).toBe(defaultContent.defense.buildCost);
    expect(stockCount(simulation, 'wood')).toBe(0);

    // Aucun bois au stock : la baliste est payée sur le sac du joueur.
    simulation.teleportPlayer({ x: 140, y: 0 });
    simulation.step(input(sequence++, { buildDefense: true }));
    finishConstruction(simulation, sequence);
    expect(simulation.createSnapshot().defenses[0]?.built).toBe(true);
    expect(bagCount(simulation, 'wood')).toBe(0);
  });

  it('starts the first night with a substantially denser assault', () => {
    const simulation = new GameSimulation(defaultContent, 'harder-night');
    simulation.start();
    simulation.skipToNight();

    const assailants = simulation
      .createSnapshot()
      .enemies.filter((enemy) => enemy.kind !== 'guardian');
    expect(assailants).toHaveLength(14);
    expect(assailants.filter((enemy) => enemy.kind === 'raider')).toHaveLength(5);
  });

  it('spawns larger, brute-bearing assaults on later nights', () => {
    const count = (instructions: readonly { count: number }[]): number =>
      instructions.reduce((total, instruction) => total + instruction.count, 0);
    const firstNight = nightSpawnInstructions(defaultContent, 1);
    const laterNight = nightSpawnInstructions(defaultContent, 3);

    expect(count(laterNight)).toBeGreaterThan(count(firstNight));
    expect(firstNight.some((instruction) => instruction.kind === 'brute')).toBe(false);
    expect(laterNight.some((instruction) => instruction.kind === 'brute')).toBe(true);
  });

  it('makes later-night assailants tougher than the first night', () => {
    const resilient = {
      ...defaultContent,
      player: { ...defaultContent.player, maxHp: 1_000_000 },
      village: { ...defaultContent.village, maxHp: 1_000_000 },
    };
    const simulation = new GameSimulation(resilient, 'escalation');
    simulation.start();
    const dayTicks = resilient.simulation.dayDurationMs / resilient.simulation.tickMs;
    const nightTicks = resilient.simulation.nightDurationMs / resilient.simulation.tickMs;
    let sequence = 0;
    const run = (ticks: number): void => {
      for (let tick = 0; tick < ticks; tick += 1) {
        simulation.step(input(sequence++));
      }
    };

    run(dayTicks); // jour 1 -> nuit 1
    run(nightTicks); // nuit 1 -> jour 2
    run(dayTicks); // jour 2 -> nuit 2

    const state = simulation.createSnapshot();
    expect(state.phase).toBe('night');
    expect(state.cycle).toBe(2);
    const raiders = state.enemies.filter((enemy) => enemy.kind === 'raider');
    expect(raiders.some((raider) => raider.maxHp > resilient.enemies.raider.maxHp)).toBe(true);
  });

  it('drops salvage wood from slain night assailants so victory stays reachable', () => {
    const simulation = new GameSimulation(defaultContent, 'salvage');
    simulation.start();
    simulation.skipToNight();
    const raider = simulation.createSnapshot().enemies.find((enemy) => enemy.kind === 'raider')!;
    const before = stockCount(simulation, 'wood');

    simulation.defeatEnemy(raider.id);

    expect(stockCount(simulation, 'wood')).toBe(before + defaultContent.enemies.raider.woodReward);
    expect(defaultContent.enemies.raider.woodReward).toBeGreaterThan(0);
  });

  it('preserves the identity and attributes of enemies surviving the night', () => {
    const content = {
      ...defaultContent,
      simulation: {
        ...defaultContent.simulation,
        nightDurationMs: defaultContent.simulation.tickMs,
      },
      progression: {
        ...defaultContent.progression,
        experiencePerLevel: [1_000],
      },
    };
    const simulation = new GameSimulation(content, 'persistent-survivors');
    simulation.start();
    simulation.skipToNight();
    const bruteId = simulation.spawnEnemy('brute', { x: 1_000, y: 1_000 });

    simulation.step(input(1));
    let brute = simulation.createSnapshot().enemies.find((enemy) => enemy.id === bruteId);
    expect(brute).toMatchObject({
      kind: 'brute',
      hp: defaultContent.enemies.brute.maxHp,
      maxHp: defaultContent.enemies.brute.maxHp,
      awake: false,
    });

    simulation.skipToNight();
    brute = simulation.createSnapshot().enemies.find((enemy) => enemy.id === bruteId);
    expect(brute).toMatchObject({ kind: 'brute', awake: true });

    simulation.defeatEnemy(bruteId);
    expect(simulation.createSnapshot().player.experience).toBe(
      defaultContent.enemies.brute.experience,
    );
  });

  it('offers varied upgrades reproducibly from an independent seeded stream', () => {
    const choicesFor = (seed: string, consumeWorldRandom = false): readonly string[] => {
      const simulation = new GameSimulation(defaultContent, seed);
      simulation.start();
      if (consumeWorldRandom) {
        for (let index = 0; index < 5; index += 1) {
          simulation.spawnEnemy();
        }
      }
      simulation.giveExperience(defaultContent.progression.experiencePerLevel[0]!);
      return simulation.createSnapshot().upgradeChoices.map((choice) => choice.id);
    };

    expect(choicesFor('upgrade-seed')).toEqual(choicesFor('upgrade-seed'));
    expect(choicesFor('upgrade-seed', true)).toEqual(choicesFor('upgrade-seed'));

    const distinctOffers = new Set(
      Array.from({ length: 8 }, (_, index) => choicesFor(`upgrade-seed-${index}`).join(',')),
    );
    expect(distinctOffers.size).toBeGreaterThan(1);
  });

  it('stacks further levels instead of suspending progression on a pending choice', () => {
    const simulation = new GameSimulation(defaultContent, 'stacked-upgrades');
    simulation.start();
    const [first, second] = defaultContent.progression.experiencePerLevel;

    simulation.giveExperience(first! + second!);
    let state = simulation.createSnapshot();
    expect(state.player.level).toBe(3);
    expect(state.player.pendingUpgrades).toBe(2);
    expect(state.upgradeChoices).toHaveLength(defaultContent.progression.upgradeChoiceCount);

    // Un seul choix est résolu à la fois, et une nouvelle offre le remplace.
    const firstChoice = state.upgradeChoices[0]!;
    simulation.step(input(1, { selectUpgradeId: firstChoice.id }));
    state = simulation.createSnapshot();
    expect(state.player.pendingUpgrades).toBe(1);
    expect(state.player.selectedUpgrades).toEqual([firstChoice.id]);
    expect(state.upgradeChoices).not.toHaveLength(0);
    expect(state.upgradeChoices.some((choice) => choice.id === firstChoice.id)).toBe(false);

    const secondChoice = state.upgradeChoices[0]!;
    simulation.step(input(2, { selectUpgradeId: secondChoice.id }));
    state = simulation.createSnapshot();
    expect(state.player.pendingUpgrades).toBe(0);
    expect(state.upgradeChoices).toHaveLength(0);
  });

  it('abandons the pending debt once the upgrade catalogue is exhausted', () => {
    const simulation = new GameSimulation(defaultContent, 'exhausted-catalogue');
    simulation.start();
    let sequence = 0;
    for (let index = 0; index < defaultContent.upgrades.length + 2; index += 1) {
      simulation.giveExperience(500);
      const choice = simulation.createSnapshot().upgradeChoices[0];
      if (choice !== undefined) {
        simulation.step(input(sequence++, { selectUpgradeId: choice.id }));
      }
    }

    expect(simulation.createSnapshot().player.selectedUpgrades).toHaveLength(
      defaultContent.upgrades.length,
    );

    // Des niveaux gagnés alors qu'il ne reste rien à proposer ne doivent pas
    // laisser une dette que le joueur ne pourrait jamais solder.
    simulation.giveExperience(5_000);
    const state = simulation.createSnapshot();
    expect(state.player.level).toBeGreaterThan(7);
    expect(state.upgradeChoices).toHaveLength(0);
    expect(state.player.pendingUpgrades).toBe(0);
  });

  it('publishes a directional event for the automatic sword attack', () => {
    const simulation = new GameSimulation(defaultContent, 'sword-animation');
    simulation.start();
    const player = simulation.createSnapshot().player.position;
    simulation.spawnEnemy('guardian', { x: player.x + 70, y: player.y });

    let state = simulation.createSnapshot();
    for (let tick = 1; tick <= 15; tick += 1) {
      simulation.step(input(tick));
      state = simulation.createSnapshot();
    }

    const slash = state.events.find((event) => event.type === 'sword-auto-attack');
    expect(slash?.origin).toBeDefined();
    expect(slash?.position).toBeDefined();
  });

  it('loses immediately when the solo character falls', () => {
    const simulation = new GameSimulation(defaultContent, 'defeat');
    simulation.start();
    simulation.damagePlayer(defaultContent.player.maxHp * 2);
    expect(simulation.createSnapshot().status).toBe('defeat');
    expect(simulation.createSnapshot().resultReason).toMatch(/personnage/i);
  });
});
