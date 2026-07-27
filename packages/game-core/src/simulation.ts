import type { GameContent, UpgradeDefinition } from '@village-survivor/content';
import type {
  EnemyKind,
  GameEvent,
  GameEventType,
  GamePhase,
  GameStatus,
  PlayerInput,
  PublicGameState,
  ResourceType,
  Vector2,
} from '@village-survivor/protocol';
import { INVENTORY_SIZE, PLAYER_STACK_SIZE } from '@village-survivor/protocol';

import { type CombatContext, updateDefenseCombat, updateEnemyCombat } from './combat-system.js';
import { canPlaceDefenseAt, createDefense, repairDefense } from './construction-system.js';
import { clampPosition, distance, distanceToSegment } from './geometry.js';
import {
  addToInventory,
  countResource,
  createInventory,
  hasRoomFor,
  mergeIntoUnlimited,
  removeResource,
} from './inventory.js';
import { updatePlayerMovement } from './movement-system.js';
import {
  awakenAssailants,
  dayReinforcementInstructions,
  finalSpawnInstructions,
  nightSpawnInstructions,
  restSurvivingAssailants,
  type SpawnInstruction,
} from './phase-system.js';
import { SeededRandom } from './random.js';
import { createPublicGameState } from './snapshot.js';
import type {
  MutableDefense,
  MutableEnemy,
  MutablePlayer,
  MutableResource,
  MutableVillage,
} from './state.js';
import {
  findNearestDefense,
  findNearestEnemy,
  isEnemyTargetable,
  wakeNearbyEnemies,
} from './targeting.js';
import { selectWeightedUpgrades } from './upgrade-selection.js';

const VILLAGE_POSITION: Vector2 = { x: 0, y: 0 };
/** Durée par défaut du canal de réparation d'une baliste (0,3 s). */
const REPAIR_CHANNEL_MS = 300;
/** Libellés français des ressources, pour les info-bulles d'interaction. */
const RESOURCE_LABELS: Record<ResourceType, string> = {
  wood: 'bois',
  stone: 'pierre',
  iron: 'fer',
  gold: 'or',
  diamond: 'diamant',
};

export class GameSimulation {
  private readonly random: SeededRandom;
  private readonly upgradeRandom: SeededRandom;
  private readonly seed: string;
  private readonly content: GameContent;
  private readonly resources: MutableResource[] = [];
  private readonly enemies: MutableEnemy[] = [];
  private readonly defenses: MutableDefense[] = [];
  private readonly player: MutablePlayer;
  private readonly village: MutableVillage;
  private readonly combatContext: CombatContext;
  private status: GameStatus = 'ready';
  private resultReason: string | undefined;
  private phase: GamePhase = 'day';
  private cycle = 1;
  private phaseRemainingMs: number;
  private tick = 0;
  private elapsedMs = 0;
  private enemyCounter = 0;
  private defenseCounter = 0;
  private activeConstructionId: string | undefined;
  /** Origine et montant du bois débité pour la construction en cours (remboursement). */
  private activeConstructionPayment: { source: 'village' | 'player'; amount: number } | undefined;
  /** Vrai si le joueur a subi des dégâts durant ce tick (annule tout canal). */
  private tookDamageThisTick = false;
  private eventCounter = 0;
  private events: GameEvent[] = [];
  private upgradeChoices: UpgradeDefinition[] = [];
  /**
   * Nombre de joueurs de la partie co-op (chacun sa propre instance déterministe).
   * Clampé à [1, 10] ; 1 par défaut, ce qui préserve exactement le comportement
   * historique (aucune mise à l'échelle des vagues).
   */
  private readonly playerCount: number;

  public constructor(
    content: GameContent,
    seed: string,
    options?: Readonly<{ playerCount?: number }>,
  ) {
    this.content = content;
    this.seed = seed;
    this.random = new SeededRandom(seed);
    this.upgradeRandom = new SeededRandom(`${seed}:upgrades`);
    const requestedPlayerCount = options?.playerCount;
    this.playerCount =
      requestedPlayerCount !== undefined && Number.isFinite(requestedPlayerCount)
        ? Math.min(10, Math.max(1, Math.round(requestedPlayerCount)))
        : 1;
    this.phaseRemainingMs = content.simulation.dayDurationMs;
    this.player = {
      position: { x: 0, y: content.world.playerStartOffsetY },
      hp: content.player.maxHp,
      maxHp: content.player.maxHp,
      ward: content.barrier.maxWard,
      maxWard: content.barrier.maxWard,
      wardRefreshRemainingMs: content.barrier.wardRefreshMs,
      moveSpeed: content.player.moveSpeed,
      inventory: createInventory(),
      experience: 0,
      experienceToNext:
        content.progression.experiencePerLevel[0] ?? content.progression.fallbackExperienceToNext,
      level: 1,
      swordAutoDamage: content.sword.autoDamage,
      swordAutoRange: content.sword.autoRange,
      swordAutoCooldownMs: content.sword.autoCooldownMs,
      swordAutoCooldownRemainingMs: content.sword.autoCooldownMs,
      swordCooldownMs: content.sword.lungeCooldownMs,
      swordCooldownRemainingMs: 0,
      barrierCooldownMs: content.barrier.activeCooldownMs,
      barrierCooldownRemainingMs: 0,
      barrierDurationMs: content.barrier.activeDurationMs,
      barrierActiveRemainingMs: 0,
      healBuffRemainingMs: 0,
      healCooldownMs: content.heal.cooldownMs,
      healCooldownRemainingMs: 0,
      interactionChannel: undefined,
      interactionCommitted: false,
      selectedUpgrades: [],
      pendingUpgrades: 0,
      lastAim: { x: 1, y: 0 },
    };
    this.village = {
      position: VILLAGE_POSITION,
      hp: content.village.maxHp,
      maxHp: content.village.maxHp,
      heartLevel: 1,
      underAttack: false,
      inventory: createInventory(),
    };
    this.combatContext = {
      content: this.content,
      enemies: this.enemies,
      defenses: this.defenses,
      player: this.player,
      village: this.village,
      damageEnemy: (enemy, amount) => this.damageEnemy(enemy, amount),
      damagePlayer: (amount, attackerPosition) =>
        this.applyDamageToPlayer(amount, attackerPosition),
      destroyDefense: (defense) => this.destroyDefense(defense),
      addEvent: (type, message, details) => this.addEvent(type, message, details),
    };
    this.generateWorld();
  }

  public start(): void {
    if (this.status === 'ready') {
      this.status = 'running';
    }
  }

  public step(input: PlayerInput): void {
    this.events = [];
    if (this.status !== 'running') {
      return;
    }

    const deltaMs = this.content.simulation.tickMs;
    const deltaSeconds = deltaMs / 1_000;
    this.tick += 1;
    this.elapsedMs += deltaMs;
    this.village.underAttack = false;
    this.tookDamageThisTick = false;

    this.updateCooldowns(deltaMs);
    updatePlayerMovement(
      this.player,
      input,
      deltaSeconds,
      this.content.world,
      this.activeConstructionId !== undefined,
    );
    this.useAbilities(input);
    this.updateAutomaticSword();
    updateDefenseCombat(this.combatContext);
    updateEnemyCombat(this.combatContext, this.phase, deltaMs, deltaSeconds);
    this.updateDefenseConstruction(deltaMs);
    this.removeDefeatedEnemies();
    this.updateVillageSupport(deltaSeconds);
    this.updateResourceRegen(deltaMs);
    this.handleInteraction(input);
    this.updateInteractionChannel(input, deltaMs);
    this.handleUpgradeSelection(input);
    this.updatePhase(deltaMs);
    this.checkDefeat();
  }

  /**
   * Événements du tick courant. Le prochain `step()` les remplace : un adaptateur
   * qui avance plusieurs ticks avant de publier doit les collecter à chaque tick,
   * sinon seuls ceux du dernier tick lui parviennent.
   */
  public getEvents(): readonly GameEvent[] {
    return this.events;
  }

  public createSnapshot(): PublicGameState {
    const interactionHint = this.getInteractionHint();
    return createPublicGameState({
      tick: this.tick,
      elapsedMs: this.elapsedMs,
      status: this.status,
      resultReason: this.resultReason,
      seed: this.seed,
      content: this.content,
      phase: this.phase,
      cycle: this.cycle,
      phaseRemainingMs: this.phaseRemainingMs,
      player: this.player,
      village: this.village,
      defenses: this.defenses,
      resources: this.resources,
      enemies: this.enemies,
      upgradeChoices: this.upgradeChoices,
      interactionHint,
      objective: this.getObjective(),
      events: this.events,
    });
  }

  public damagePlayer(amount: number): void {
    if (this.status === 'running') {
      this.applyDamageToPlayer(Math.max(0, amount), this.player.position);
      this.checkDefeat();
    }
  }

  public giveExperience(amount: number): void {
    if (this.status === 'running') {
      this.addExperience(Math.max(0, amount));
    }
  }

  public giveResources(amount: number): void {
    if (this.status === 'running') {
      mergeIntoUnlimited(this.village.inventory, 'wood', Math.max(0, Math.floor(amount)));
    }
  }

  public teleportPlayer(position: Vector2): void {
    if (this.status === 'running') {
      this.player.position = clampPosition(
        position,
        this.content.world.width,
        this.content.world.height,
      );
    }
  }

  public defeatEnemy(enemyId: string): void {
    const enemy = this.enemies.find((candidate) => candidate.id === enemyId);
    if (this.status === 'running' && enemy !== undefined) {
      this.damageEnemy(enemy, enemy.hp);
      this.removeDefeatedEnemies();
    }
  }

  public defeatAllAssailants(): void {
    if (this.status !== 'running') {
      return;
    }
    for (const enemy of this.enemies) {
      if (enemy.kind !== 'guardian') {
        this.damageEnemy(enemy, enemy.hp);
      }
    }
    this.removeDefeatedEnemies();
  }

  public spawnEnemy(kind: EnemyKind = 'raider', position?: Vector2): string {
    const ring = this.content.world.debugEnemySpawnRing;
    const spawnPosition =
      position ?? this.randomRingPosition(ring.minimumRadius, ring.maximumRadius);
    return this.createEnemy(kind, spawnPosition, spawnPosition, kind !== 'sleeper');
  }

  public skipToNight(): void {
    if (this.status === 'running' && this.phase === 'day') {
      this.beginNight();
    }
  }

  public forceFinalWave(): void {
    if (this.status === 'running') {
      this.village.heartLevel = 3;
      this.beginFinalWave();
    }
  }

  private generateWorld(): void {
    // Placement VRAIMENT aléatoire, gisement par gisement : chaque ressource tire un
    // angle uniforme (0→2π) et un rayon uniforme entre son seuil `minDistanceFromVillage`
    // et le bord jouable de la carte (ou son `maxDistanceFromVillage`). Les seuils
    // croissants (fer < or < diamant, marge village pour bois/pierre) garantissent la
    // rareté sans imposer d'anneau régulier.
    const innerEdgeMargin = 100;
    const edgeRadius =
      Math.min(this.content.world.width, this.content.world.height) / 2 - innerEdgeMargin;
    const resourceTypes: ResourceType[] = ['wood', 'stone', 'iron', 'gold', 'diamond'];
    let resourceIndex = 0;
    for (const resourceType of resourceTypes) {
      const definition = this.content.world.resources[resourceType];
      const maxRadius = Math.min(edgeRadius, definition.maxDistanceFromVillage ?? edgeRadius);
      const minRadius = Math.min(definition.minDistanceFromVillage, maxRadius);
      for (let index = 0; index < definition.nodeCount; index += 1) {
        const angle = this.random.between(0, Math.PI * 2);
        const radius = this.random.between(minRadius, maxRadius);
        const position = {
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
        };
        // Le gardien se décale du gisement selon un angle propre, tiré aléatoirement.
        const guardianAngle = this.random.between(0, Math.PI * 2);
        const guardianPosition = {
          x: position.x + Math.cos(guardianAngle) * this.content.world.guardianOffset,
          y: position.y + Math.sin(guardianAngle) * this.content.world.guardianOffset,
        };
        const guardianId = this.createEnemy(
          'guardian',
          guardianPosition,
          guardianPosition,
          true,
          definition.guardianStatScale,
        );
        resourceIndex += 1;
        this.resources.push({
          id: `resource-${resourceIndex}`,
          position,
          resourceType,
          amountRemaining: definition.maxPerNode,
          guardianId,
          regenRemainingMs: definition.regenIntervalMs,
        });
      }
    }

    const sleeperRing = this.content.world.initialSleeperRing;
    for (let index = 0; index < this.content.world.initialSleeperCount; index += 1) {
      const position = this.randomRingPosition(
        sleeperRing.minimumRadius,
        sleeperRing.maximumRadius,
      );
      this.createEnemy('sleeper', position, position, false);
    }
  }

  private createEnemy(
    kind: EnemyKind,
    position: Vector2,
    home: Vector2,
    awake: boolean,
    statScale: Readonly<{ hp: number; damage: number }> = { hp: 1, damage: 1 },
  ): string {
    this.enemyCounter += 1;
    const definition = this.content.enemies[kind];
    const id = `enemy-${this.enemyCounter}`;
    const maxHp = definition.maxHp * statScale.hp;
    this.enemies.push({
      id,
      kind,
      position: { ...position },
      home: { ...home },
      hp: maxHp,
      maxHp,
      awake,
      attackCooldownRemainingMs: this.random.between(0, definition.attackCooldownMs),
      damageScale: statScale.damage,
    });
    return id;
  }

  private randomRingPosition(minimumRadius: number, maximumRadius: number): Vector2 {
    const angle = this.random.between(0, Math.PI * 2);
    const radius = this.random.between(minimumRadius, maximumRadius);
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  }

  private updateCooldowns(deltaMs: number): void {
    this.player.swordAutoCooldownRemainingMs = Math.max(
      0,
      this.player.swordAutoCooldownRemainingMs - deltaMs,
    );
    this.player.swordCooldownRemainingMs = Math.max(
      0,
      this.player.swordCooldownRemainingMs - deltaMs,
    );
    this.player.barrierCooldownRemainingMs = Math.max(
      0,
      this.player.barrierCooldownRemainingMs - deltaMs,
    );
    this.player.barrierActiveRemainingMs = Math.max(
      0,
      this.player.barrierActiveRemainingMs - deltaMs,
    );
    this.player.healBuffRemainingMs = Math.max(0, this.player.healBuffRemainingMs - deltaMs);
    this.player.healCooldownRemainingMs = Math.max(
      0,
      this.player.healCooldownRemainingMs - deltaMs,
    );
    for (const defense of this.defenses) {
      defense.cooldownRemainingMs = Math.max(0, defense.cooldownRemainingMs - deltaMs);
    }
    this.player.wardRefreshRemainingMs -= deltaMs;
    if (this.player.wardRefreshRemainingMs <= 0) {
      this.player.ward = this.player.maxWard;
      this.player.wardRefreshRemainingMs = this.content.barrier.wardRefreshMs;
    }
  }

  private useAbilities(input: PlayerInput): void {
    if (input.activateSword === true && this.player.swordCooldownRemainingMs <= 0) {
      const start = this.player.position;
      const proposedEnd = {
        x: start.x + this.player.lastAim.x * this.content.sword.lungeDistance,
        y: start.y + this.player.lastAim.y * this.content.sword.lungeDistance,
      };
      const end = clampPosition(proposedEnd, this.content.world.width, this.content.world.height);
      this.player.position = end;
      for (const enemy of this.enemies) {
        if (
          isEnemyTargetable(enemy) &&
          distanceToSegment(enemy.position, start, end) <= this.content.sword.lungeRadius
        ) {
          this.dealPlayerDamage(enemy, this.content.sword.lungeDamage);
          wakeNearbyEnemies(this.enemies, enemy.position, this.content.sword.lungeWakeRadius);
        }
      }
      this.player.swordCooldownRemainingMs = this.player.swordCooldownMs;
    }

    if (input.activateBarrier === true && this.player.barrierCooldownRemainingMs <= 0) {
      this.player.barrierActiveRemainingMs = this.player.barrierDurationMs;
      this.player.barrierCooldownRemainingMs = this.player.barrierCooldownMs;
    }

    if (input.activateHeal === true && this.player.healCooldownRemainingMs <= 0) {
      this.player.healBuffRemainingMs = this.content.heal.buffDurationMs;
      this.player.healCooldownRemainingMs = this.player.healCooldownMs;
    }
  }

  /**
   * Point d'entrée UNIQUE des dégâts infligés par le JOUEUR (épée automatique et
   * fente), distinct des dégâts des balistes. Applique le vol de vie du soin quand
   * la fenêtre est active : 50 % du montant infligé rendus en PV.
   */
  private dealPlayerDamage(enemy: MutableEnemy, amount: number): void {
    this.damageEnemy(enemy, amount);
    if (this.player.healBuffRemainingMs > 0 && amount > 0) {
      this.player.hp = Math.min(
        this.player.maxHp,
        this.player.hp + amount * this.content.heal.lifestealFraction,
      );
    }
  }

  private updateAutomaticSword(): void {
    if (this.player.swordAutoCooldownRemainingMs > 0) {
      return;
    }
    const target = findNearestEnemy(
      this.enemies,
      this.player.position,
      this.player.swordAutoRange,
      isEnemyTargetable,
    );
    if (target === undefined) {
      return;
    }
    this.addEvent('sword-auto-attack', 'Coup d’épée automatique.', {
      origin: this.player.position,
      position: target.position,
    });
    this.dealPlayerDamage(target, this.player.swordAutoDamage);
    wakeNearbyEnemies(this.enemies, target.position, this.content.sword.automaticAttackWakeRadius);
    this.player.swordAutoCooldownRemainingMs = this.player.swordAutoCooldownMs;
  }

  private applyDamageToPlayer(amount: number, attackerPosition: Vector2): void {
    let remainingDamage = amount;
    if (
      this.player.barrierActiveRemainingMs > 0 &&
      distance(attackerPosition, this.player.position) <= this.content.barrier.activeRadius
    ) {
      remainingDamage *= 1 - this.content.barrier.damageReduction;
    }
    const absorbed = Math.min(this.player.ward, remainingDamage);
    this.player.ward -= absorbed;
    remainingDamage -= absorbed;
    this.player.hp = Math.max(0, this.player.hp - remainingDamage);
    this.player.wardRefreshRemainingMs = this.content.barrier.wardRefreshMs;
    this.addEvent('player-hurt', `Vous subissez ${Math.ceil(amount)} dégâts.`, {
      position: this.player.position,
      amount,
    });
    if (amount > 0) {
      this.tookDamageThisTick = true;
      this.interruptDefenseConstruction();
    }
  }

  private damageEnemy(enemy: MutableEnemy, amount: number): void {
    if (enemy.hp <= 0) {
      return;
    }
    enemy.hp = Math.max(0, enemy.hp - amount);
    this.addEvent('enemy-hit', `${Math.ceil(amount)} dégâts`, {
      position: enemy.position,
      amount,
    });
    if (enemy.hp <= 0) {
      this.addEvent('enemy-killed', 'Ennemi éliminé.', { position: enemy.position });
      this.addExperience(this.content.enemies[enemy.kind].experience);
      this.dropWood(enemy);
    }
  }

  /**
   * Butin de bois d'un assaillant vaincu. Il rejoint directement le stock : la
   * ressource statique étant finie, c'est ce qui garantit qu'un joueur ne reste
   * jamais bloqué sans bois pour atteindre la victoire.
   */
  private dropWood(enemy: MutableEnemy): void {
    const reward = this.content.enemies[enemy.kind].woodReward;
    if (reward <= 0) {
      return;
    }
    mergeIntoUnlimited(this.village.inventory, 'wood', reward);
    this.addEvent('resource-collected', `+${reward} bois`, {
      position: enemy.position,
      amount: reward,
    });
  }

  private removeDefeatedEnemies(): void {
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
      const enemy = this.enemies[index];
      if (enemy !== undefined && enemy.hp <= 0) {
        this.enemies.splice(index, 1);
      }
    }
  }

  private updateVillageSupport(deltaSeconds: number): void {
    if (this.phase === 'day' && this.village.heartLevel >= 2 && this.isPlayerInsideVillage()) {
      const multiplier = this.village.underAttack
        ? this.content.village.underAttackRegenMultiplier
        : 1;
      this.player.hp = Math.min(
        this.player.maxHp,
        this.player.hp + this.content.village.dayRegenPerSecond * multiplier * deltaSeconds,
      );
    }
  }

  /**
   * Dépose la pile ENTIÈRE d'une case joueur vers le village (fusion sans plafond),
   * puis vide la case. No-op hors zone village, index invalide ou case vide.
   */
  private depositSlot(index: number): void {
    if (!this.isPlayerInsideVillage() || !this.isValidSlotIndex(index)) {
      return;
    }
    const slot = this.player.inventory[index];
    if (slot === undefined || slot.quantity <= 0) {
      return;
    }
    if (!mergeIntoUnlimited(this.village.inventory, slot.resourceType, slot.quantity)) {
      return;
    }
    const deposited = slot.quantity;
    const resourceType = slot.resourceType;
    this.player.inventory[index] = undefined;
    this.addEvent('resource-deposited', `${deposited} ${resourceType} déposé au village.`, {
      position: this.player.position,
      amount: deposited,
    });
  }

  /** Applique `depositSlot` à chaque case occupée du joueur, dans l'ordre des index. */
  private depositAll(): void {
    if (!this.isPlayerInsideVillage()) {
      return;
    }
    for (let index = 0; index < this.player.inventory.length; index += 1) {
      if (this.player.inventory[index] !== undefined) {
        this.depositSlot(index);
      }
    }
  }

  /**
   * Retire jusqu'à PLAYER_STACK_SIZE unités d'une case village vers le joueur : dans
   * une case joueur du même type avec de la place, sinon la première case vide. Le
   * montant réel est borné par le stock village et la place restante côté joueur.
   */
  private withdrawSlot(index: number): void {
    if (!this.isPlayerInsideVillage() || !this.isValidSlotIndex(index)) {
      return;
    }
    const villageSlot = this.village.inventory[index];
    if (villageSlot === undefined || villageSlot.quantity <= 0) {
      return;
    }
    const resourceType = villageSlot.resourceType;
    let targetIndex = -1;
    let capacityInTarget = 0;
    for (let i = 0; i < this.player.inventory.length; i += 1) {
      const slot = this.player.inventory[i];
      if (
        slot !== undefined &&
        slot.resourceType === resourceType &&
        slot.quantity < PLAYER_STACK_SIZE
      ) {
        targetIndex = i;
        capacityInTarget = PLAYER_STACK_SIZE - slot.quantity;
        break;
      }
    }
    if (targetIndex === -1) {
      for (let i = 0; i < this.player.inventory.length; i += 1) {
        if (this.player.inventory[i] === undefined) {
          targetIndex = i;
          capacityInTarget = PLAYER_STACK_SIZE;
          break;
        }
      }
    }
    if (targetIndex === -1) {
      return;
    }
    const amount = Math.min(PLAYER_STACK_SIZE, villageSlot.quantity, capacityInTarget);
    if (amount <= 0) {
      return;
    }
    const target = this.player.inventory[targetIndex];
    if (target === undefined) {
      this.player.inventory[targetIndex] = { resourceType, quantity: amount };
    } else {
      target.quantity += amount;
    }
    villageSlot.quantity -= amount;
    if (villageSlot.quantity <= 0) {
      this.village.inventory[index] = undefined;
    }
    this.addEvent('resource-withdrawn', `${amount} ${resourceType} retiré du village.`, {
      position: this.player.position,
      amount,
    });
  }

  private isValidSlotIndex(index: number): boolean {
    return Number.isInteger(index) && index >= 0 && index < INVENTORY_SIZE;
  }

  private handleInteraction(input: PlayerInput): void {
    if (input.buildDefense === true) {
      this.startDefenseConstruction();
    }
    if (input.upgradeHeart === true) {
      this.upgradeVillageHeart();
    }
    if (typeof input.depositSlot === 'number') {
      this.depositSlot(input.depositSlot);
    }
    if (typeof input.withdrawSlot === 'number') {
      this.withdrawSlot(input.withdrawSlot);
    }
    if (input.depositAll === true) {
      this.depositAll();
    }
  }

  /**
   * Canal d'interaction générique (récolte/réparation). UN SEUL appui `interact`
   * engage l'interaction (`interactionCommitted`), qui se poursuit ensuite d'elle-même
   * sans qu'il faille maintenir ni recliquer : à la complétion d'une unité de récolte,
   * un nouveau canal démarre aussitôt sur le MÊME gisement tant qu'il reste du stock et
   * de la place dans le sac. Le relâchement du clic n'a plus aucun effet une fois engagé.
   * Un déplacement ou des dégâts subis ce tick annulent le canal et lèvent l'engagement.
   *
   * Choix pour la réparation de baliste : elle partage le même engagement `interactionCommitted`
   * par simplicité. En pratique un seul appui répare donc la baliste jusqu'à ses PV max
   * (ou épuisement du bois), après quoi `findRepairableDefense` ne la retient plus et
   * l'engagement retombe — comportement acceptable pour une action ponctuelle.
   */
  private updateInteractionChannel(input: PlayerInput, deltaMs: number): void {
    const moving = input.moveX !== 0 || input.moveY !== 0;
    if (this.tookDamageThisTick || moving) {
      this.player.interactionChannel = undefined;
      this.player.interactionCommitted = false;
      return;
    }
    // Un appui engage l'interaction ; ensuite elle se relance seule tant qu'elle dure.
    if (input.interact === true) {
      this.player.interactionCommitted = true;
    }
    if (!this.player.interactionCommitted) {
      this.player.interactionChannel = undefined;
      return;
    }
    const resource = this.findHarvestableResource();
    if (resource !== undefined) {
      const definition = this.content.world.resources[resource.resourceType];
      if (
        this.player.interactionChannel?.targetId === resource.id &&
        this.player.interactionChannel.kind === 'harvest'
      ) {
        this.player.interactionChannel.remainingMs -= deltaMs;
      } else {
        this.player.interactionChannel = {
          targetId: resource.id,
          kind: 'harvest',
          remainingMs: definition.harvestDurationMs,
          totalMs: definition.harvestDurationMs,
        };
      }
      if (this.player.interactionChannel.remainingMs <= 0) {
        addToInventory(this.player.inventory, resource.resourceType, PLAYER_STACK_SIZE);
        resource.amountRemaining -= 1;
        this.addEvent('resource-collected', `+1 ${resource.resourceType} récolté.`, {
          position: resource.position,
          amount: 1,
        });
        // Relance immédiate sur le même gisement s'il reste stock ET place, sinon on arrête.
        if (
          resource.amountRemaining > 0 &&
          hasRoomFor(this.player.inventory, resource.resourceType, PLAYER_STACK_SIZE)
        ) {
          this.player.interactionChannel = {
            targetId: resource.id,
            kind: 'harvest',
            remainingMs: definition.harvestDurationMs,
            totalMs: definition.harvestDurationMs,
          };
        } else {
          this.player.interactionChannel = undefined;
          this.player.interactionCommitted = false;
        }
      }
      return;
    }
    const defense = this.findRepairableDefense();
    if (defense !== undefined) {
      const totalMs = REPAIR_CHANNEL_MS;
      if (
        this.player.interactionChannel?.targetId === defense.id &&
        this.player.interactionChannel.kind === 'repair'
      ) {
        this.player.interactionChannel.remainingMs -= deltaMs;
      } else {
        this.player.interactionChannel = {
          targetId: defense.id,
          kind: 'repair',
          remainingMs: totalMs,
          totalMs,
        };
      }
      if (this.player.interactionChannel.remainingMs <= 0) {
        repairDefense(defense, this.village.inventory, this.player.inventory, this.content.defense);
        this.player.interactionChannel = undefined;
      }
      return;
    }
    // Plus rien à faire (gisement épuisé, sac plein, hors de portée) : on relâche.
    this.player.interactionChannel = undefined;
    this.player.interactionCommitted = false;
  }

  /**
   * Pousse continue des gisements : chaque ressource regagne `regenAmount` unité(s)
   * toutes les `regenIntervalMs`, plafonné à `maxPerNode` de son type. Indépendant du
   * joueur et du combat — le gardien peut être vivant ou mort.
   */
  private updateResourceRegen(deltaMs: number): void {
    for (const resource of this.resources) {
      const definition = this.content.world.resources[resource.resourceType];
      resource.regenRemainingMs -= deltaMs;
      while (resource.regenRemainingMs <= 0) {
        resource.amountRemaining = Math.min(
          definition.maxPerNode,
          resource.amountRemaining + definition.regenAmount,
        );
        resource.regenRemainingMs += definition.regenIntervalMs;
      }
    }
  }

  private startDefenseConstruction(): void {
    if (
      this.activeConstructionId !== undefined ||
      !canPlaceDefenseAt(this.player.position, this.village, this.defenses, this.content)
    ) {
      return;
    }
    const cost = this.content.defense.buildCost;
    if (countResource(this.village.inventory, 'wood') >= cost) {
      removeResource(this.village.inventory, 'wood', cost);
      this.activeConstructionPayment = { source: 'village', amount: cost };
    } else if (countResource(this.player.inventory, 'wood') >= cost) {
      removeResource(this.player.inventory, 'wood', cost);
      this.activeConstructionPayment = { source: 'player', amount: cost };
    } else {
      return;
    }
    this.defenseCounter += 1;
    const defense = createDefense(
      `defense-${this.defenseCounter}`,
      this.player.position,
      this.content.defense,
    );
    this.defenses.push(defense);
    this.activeConstructionId = defense.id;
    this.addEvent('defense-construction-started', 'Fabrication de la baliste : restez à couvert.', {
      position: defense.position,
    });
  }

  private updateDefenseConstruction(deltaMs: number): void {
    if (this.activeConstructionId === undefined) {
      return;
    }
    const defense = this.defenses.find((candidate) => candidate.id === this.activeConstructionId);
    if (defense === undefined) {
      this.activeConstructionId = undefined;
      return;
    }
    defense.buildRemainingMs = Math.max(0, defense.buildRemainingMs - deltaMs);
    if (defense.buildRemainingMs > 0) {
      return;
    }
    defense.built = true;
    this.activeConstructionId = undefined;
    this.activeConstructionPayment = undefined;
    this.addEvent('defense-built', 'La baliste est opérationnelle.', {
      position: defense.position,
    });
  }

  private interruptDefenseConstruction(): void {
    if (this.activeConstructionId === undefined) {
      return;
    }
    const index = this.defenses.findIndex((defense) => defense.id === this.activeConstructionId);
    const defense = this.defenses[index];
    this.activeConstructionId = undefined;
    if (defense === undefined) {
      return;
    }
    this.defenses.splice(index, 1);
    const payment = this.activeConstructionPayment;
    if (payment !== undefined) {
      if (payment.source === 'player') {
        this.refundWoodToPlayer(payment.amount);
      } else {
        mergeIntoUnlimited(this.village.inventory, 'wood', payment.amount);
      }
      this.activeConstructionPayment = undefined;
    }
    this.addEvent(
      'defense-construction-interrupted',
      'Fabrication interrompue par les dégâts : ressources remboursées.',
      { position: defense.position },
    );
  }

  /** Rembourse du bois au joueur, unité par unité, dans la limite de son inventaire. */
  private refundWoodToPlayer(amount: number): void {
    for (let index = 0; index < amount; index += 1) {
      if (!addToInventory(this.player.inventory, 'wood', PLAYER_STACK_SIZE)) {
        // Débordement improbable : bascule le reste vers le stock du village.
        mergeIntoUnlimited(this.village.inventory, 'wood', amount - index);
        return;
      }
    }
  }

  private destroyDefense(defense: MutableDefense): void {
    if (defense.id === this.activeConstructionId) {
      this.interruptDefenseConstruction();
      return;
    }
    const index = this.defenses.findIndex((candidate) => candidate.id === defense.id);
    if (index >= 0) {
      this.defenses.splice(index, 1);
      this.addEvent('defense-destroyed', 'Une baliste a été détruite.', {
        position: defense.position,
      });
    }
  }

  private upgradeVillageHeart(): void {
    if (this.village.heartLevel === 1) {
      if (countResource(this.village.inventory, 'wood') < this.content.village.levelTwoCost) {
        return;
      }
      removeResource(this.village.inventory, 'wood', this.content.village.levelTwoCost);
      this.village.heartLevel = 2;
      this.addEvent('heart-upgraded', 'Le Cœur devient un Foyer régénérant.', {
        position: this.village.position,
      });
      return;
    }
    if (
      this.village.heartLevel === 2 &&
      this.hasOperationalDefense() &&
      this.player.level >= this.content.village.ultimateMinimumPlayerLevel &&
      countResource(this.village.inventory, 'wood') >= this.content.village.ultimateCost
    ) {
      removeResource(this.village.inventory, 'wood', this.content.village.ultimateCost);
      this.village.heartLevel = 3;
      this.addEvent('heart-upgraded', "L'ultime activation du Cœur commence.", {
        position: this.village.position,
      });
      this.beginFinalWave();
    }
  }

  /**
   * Les niveaux s'empilent : une offre en attente ne suspend plus la progression,
   * afin que le joueur puisse repousser son choix jusqu'à un moment calme.
   */
  private addExperience(amount: number): void {
    this.player.experience += amount;
    while (this.player.experience >= this.player.experienceToNext) {
      this.player.experience -= this.player.experienceToNext;
      this.player.level += 1;
      this.player.experienceToNext =
        this.content.progression.experiencePerLevel[this.player.level - 1] ??
        this.content.progression.fallbackExperienceToNext;
      this.player.pendingUpgrades += 1;
      this.addEvent('level-up', `Niveau ${this.player.level} atteint.`, {
        position: this.player.position,
      });
    }
    this.refreshUpgradeChoices();
  }

  /**
   * Une offre est tirée à la demande, jamais d'avance : deux niveaux empilés ne
   * peuvent donc pas proposer deux fois la même amélioration.
   */
  private refreshUpgradeChoices(): void {
    if (this.player.pendingUpgrades <= 0 || this.upgradeChoices.length > 0) {
      return;
    }
    const choices = selectWeightedUpgrades(
      this.content.upgrades,
      this.player.selectedUpgrades,
      this.content.progression.upgradeChoiceCount,
      this.upgradeRandom,
    );
    if (choices.length === 0) {
      // Catalogue épuisé : plus rien à choisir, la dette est abandonnée.
      this.player.pendingUpgrades = 0;
      return;
    }
    this.upgradeChoices = choices;
  }

  private handleUpgradeSelection(input: PlayerInput): void {
    if (input.selectUpgradeId === undefined || this.upgradeChoices.length === 0) {
      return;
    }
    const upgrade = this.upgradeChoices.find((choice) => choice.id === input.selectUpgradeId);
    if (upgrade === undefined) {
      return;
    }
    this.applyUpgrade(upgrade);
    this.player.selectedUpgrades.push(upgrade.id);
    this.upgradeChoices = [];
    this.player.pendingUpgrades = Math.max(0, this.player.pendingUpgrades - 1);
    this.addEvent('upgrade-selected', upgrade.name, { position: this.player.position });
    this.refreshUpgradeChoices();
  }

  private applyUpgrade(upgrade: UpgradeDefinition): void {
    switch (upgrade.effect) {
      case 'sword-damage':
        this.player.swordAutoDamage *= upgrade.value;
        break;
      case 'sword-speed':
        this.player.swordAutoCooldownMs *= upgrade.value;
        break;
      case 'sword-range':
        this.player.swordAutoRange += upgrade.value;
        break;
      case 'lunge-cooldown':
        this.player.swordCooldownMs *= upgrade.value;
        break;
      case 'ward-capacity':
        this.player.maxWard += upgrade.value;
        this.player.ward += upgrade.value;
        break;
      case 'barrier-duration':
        this.player.barrierDurationMs += upgrade.value;
        break;
    }
  }

  private updatePhase(deltaMs: number): void {
    if (this.status !== 'running') {
      return;
    }
    this.phaseRemainingMs -= deltaMs;
    if (this.phaseRemainingMs > 0) {
      return;
    }
    if (this.phase === 'day') {
      this.beginNight();
    } else if (this.phase === 'night') {
      this.beginDay();
    } else {
      this.winGame();
    }
  }

  private beginNight(): void {
    this.phase = 'night';
    this.phaseRemainingMs = this.content.simulation.nightDurationMs;
    awakenAssailants(this.enemies);
    this.spawnInstructions(
      nightSpawnInstructions(this.content, this.cycle),
      true,
      this.assaultScale(),
    );
    this.addEvent('phase-changed', `Nuit ${this.cycle} : défendez le village.`);
  }

  private beginDay(): void {
    this.phase = 'day';
    this.cycle += 1;
    this.phaseRemainingMs = this.content.simulation.dayDurationMs;
    restSurvivingAssailants(this.enemies);
    // Les renforts diurnes ne montent pas en puissance : seuls les assauts le font.
    this.spawnInstructions(dayReinforcementInstructions(this.content, this.cycle), false);
    this.addEvent('phase-changed', `Jour ${this.cycle} : explorez et préparez-vous.`);
  }

  private beginFinalWave(): void {
    this.phase = 'final';
    this.phaseRemainingMs = this.content.simulation.finalDurationMs;
    awakenAssailants(this.enemies);
    this.spawnInstructions(finalSpawnInstructions(this.content), true, this.assaultScale());
    this.addEvent('phase-changed', 'Activation finale : tenez bon !');
  }

  /** Multiplicateurs de PV et de dégâts pour un assaut du cycle courant. */
  private cycleScale(): Readonly<{ hp: number; damage: number }> {
    const elapsedCycles = this.cycle - 1;
    return {
      hp: 1 + elapsedCycles * this.content.waves.escalation.hpPerCycle,
      damage: 1 + elapsedCycles * this.content.waves.escalation.damagePerCycle,
    };
  }

  /**
   * Facteur multiplicatif appliqué au NOMBRE d'assaillants générés par vague
   * (nuit, renforts diurnes, vague finale), croissant linéairement avec le
   * nombre de joueurs de la partie co-op. `playerCount = 1` ⇒ facteur 1 (aucun
   * changement). Formule : `1 + (playerCount - 1) * enemyCountPerPlayer`.
   */
  private enemyCountScale(): number {
    const extraPlayers = this.playerCount - 1;
    return 1 + extraPlayers * this.content.waves.perPlayerScaling.enemyCountPerPlayer;
  }

  /**
   * Multiplicateurs de PV/dégâts dus au nombre de joueurs uniquement (avant
   * combinaison avec l'escalade par cycle). `playerCount = 1` ⇒ {1, 1}.
   */
  private playerStatScale(): Readonly<{ hp: number; damage: number }> {
    const extraPlayers = this.playerCount - 1;
    const scale = 1 + extraPlayers * this.content.waves.perPlayerScaling.enemyStatPerPlayer;
    return { hp: scale, damage: scale };
  }

  /**
   * Multiplicateurs de PV/dégâts combinés pour un assaut (nuit ou vague finale) :
   * escalade par cycle × mise à l'échelle par joueur. Les renforts diurnes ne
   * passent pas par cette méthode : ils ne montent pas en puissance (seul leur
   * nombre est affecté par `enemyCountScale`), comme avant l'ajout du multijoueur.
   */
  private assaultScale(): Readonly<{ hp: number; damage: number }> {
    const cycle = this.cycleScale();
    const player = this.playerStatScale();
    return { hp: cycle.hp * player.hp, damage: cycle.damage * player.damage };
  }

  private spawnInstructions(
    instructions: readonly SpawnInstruction[],
    awake: boolean,
    statScale: Readonly<{ hp: number; damage: number }> = { hp: 1, damage: 1 },
  ): void {
    const countScale = this.enemyCountScale();
    for (const instruction of instructions) {
      const scaledCount = Math.round(instruction.count * countScale);
      for (let index = 0; index < scaledCount; index += 1) {
        const position = this.randomRingPosition(
          instruction.ring.minimumRadius,
          instruction.ring.maximumRadius,
        );
        this.createEnemy(instruction.kind, position, position, awake, statScale);
      }
    }
  }

  private checkDefeat(): void {
    if (this.status !== 'running') {
      return;
    }
    if (this.player.hp <= 0) {
      this.status = 'defeat';
      this.resultReason = 'Le personnage est tombé.';
      this.addEvent('defeat', this.resultReason);
    } else if (this.village.hp <= 0) {
      this.status = 'defeat';
      this.resultReason = 'Le Cœur du village a été détruit.';
      this.addEvent('defeat', this.resultReason);
    }
  }

  private winGame(): void {
    if (this.status === 'running' && this.village.hp > 0) {
      this.status = 'victory';
      this.resultReason = 'Le Cœur est éveillé et le village a survécu.';
      this.addEvent('victory', this.resultReason);
    }
  }

  private hasOperationalDefense(): boolean {
    return this.defenses.some((defense) => defense.built);
  }

  private isGuardianAlive(guardianId: string): boolean {
    return this.enemies.some((enemy) => enemy.id === guardianId && enemy.hp > 0);
  }

  private isPlayerInsideVillage(): boolean {
    return distance(this.player.position, this.village.position) <= this.content.village.areaRadius;
  }

  private findNearbyResource(): MutableResource | undefined {
    return this.resources.find(
      (resource) =>
        distance(resource.position, this.player.position) <= this.content.player.interactionRange,
    );
  }

  /**
   * Ressource récoltable à portée : gardien vaincu, gisement non vide et place dans
   * l'inventaire du joueur. C'est la cible prioritaire du canal d'interaction.
   */
  private findHarvestableResource(): MutableResource | undefined {
    return this.resources.find(
      (resource) =>
        distance(resource.position, this.player.position) <= this.content.player.interactionRange &&
        !this.isGuardianAlive(resource.guardianId) &&
        resource.amountRemaining > 0 &&
        hasRoomFor(this.player.inventory, resource.resourceType, PLAYER_STACK_SIZE),
    );
  }

  /** Baliste bâtie à portée dont les PV sont incomplets (candidate à la réparation). */
  private findRepairableDefense(): MutableDefense | undefined {
    const nearby = findNearestDefense(
      this.defenses,
      this.player.position,
      this.content.player.interactionRange,
      true,
    );
    if (nearby !== undefined && nearby.hp < nearby.maxHp) {
      return nearby;
    }
    return undefined;
  }

  private getInteractionHint(): string | undefined {
    if (this.status !== 'running') {
      return undefined;
    }
    const resource = this.findNearbyResource();
    if (resource !== undefined) {
      const label = RESOURCE_LABELS[resource.resourceType];
      if (this.isGuardianAlive(resource.guardianId)) {
        return 'Éliminez le gardien pour accéder au gisement.';
      }
      if (resource.amountRemaining <= 0) {
        return 'Gisement épuisé, repousse en cours.';
      }
      if (!hasRoomFor(this.player.inventory, resource.resourceType, PLAYER_STACK_SIZE)) {
        return 'Votre sac est plein. Rapportez vos ressources au village.';
      }
      return `E — Récolter du ${label} (${resource.amountRemaining} restant)`;
    }
    const activeConstruction = this.defenses.find(
      (defense) => defense.id === this.activeConstructionId,
    );
    if (activeConstruction !== undefined) {
      return `Fabrication en cours — ${(activeConstruction.buildRemainingMs / 1_000).toFixed(1)} s · tout dégât interrompt`;
    }
    const nearbyDefense = findNearestDefense(
      this.defenses,
      this.player.position,
      this.content.player.interactionRange,
      true,
    );
    if (nearbyDefense !== undefined) {
      if (nearbyDefense.hp < nearbyDefense.maxHp) {
        return `E — Réparer la baliste (${this.content.defense.repairCost} bois)`;
      }
      return 'La baliste est opérationnelle.';
    }
    if (
      distance(this.player.position, this.village.position) <= this.content.player.interactionRange
    ) {
      // Hint purement visuel : le client intercepte E ici pour ouvrir l'interface
      // d'échange/amélioration et n'envoie pas `interact` au serveur pour ce cas.
      return 'E — Échanger avec le village';
    }
    if (this.isPlayerInsideVillage()) {
      if (!canPlaceDefenseAt(this.player.position, this.village, this.defenses, this.content)) {
        return 'B — Éloignez-vous du Cœur et des autres balistes.';
      }
      const woodAvailable =
        countResource(this.village.inventory, 'wood') >= this.content.defense.buildCost ||
        countResource(this.player.inventory, 'wood') >= this.content.defense.buildCost;
      return woodAvailable
        ? `B — Fabriquer une baliste ici (${this.content.defense.buildCost} bois · ${this.content.defense.buildDurationMs / 1_000} s)`
        : `B — Baliste : ${this.content.defense.buildCost} bois nécessaires (sur vous ou au stock)`;
    }
    return undefined;
  }

  private getObjective(): string {
    if (this.status === 'victory') {
      return 'Victoire — le village a survécu.';
    }
    if (this.status === 'defeat') {
      return 'Défaite — recommencez avec une nouvelle stratégie.';
    }
    if (this.phase === 'final') {
      return "Protégez le Cœur jusqu'à la fin de l'activation.";
    }
    if (countResource(this.player.inventory, 'wood') > 0) {
      return 'Rapportez votre bois au Cœur du village.';
    }
    if (!this.hasOperationalDefense()) {
      return `Explorez, récoltez ${this.content.defense.buildCost} bois et fabriquez une baliste avec B.`;
    }
    if (this.village.heartLevel === 1) {
      return `Rapportez ${this.content.village.levelTwoCost} bois pour éveiller le Foyer.`;
    }
    if (this.player.level < this.content.village.ultimateMinimumPlayerLevel) {
      return `Combattez pour atteindre le niveau ${this.content.village.ultimateMinimumPlayerLevel}.`;
    }
    if (countResource(this.village.inventory, 'wood') < this.content.village.ultimateCost) {
      return `Réunissez ${this.content.village.ultimateCost} bois dans le stock du village.`;
    }
    return "Retournez au Cœur et lancez l'activation finale.";
  }

  private addEvent(
    type: GameEventType,
    message: string,
    details: Readonly<{ position?: Vector2; origin?: Vector2; amount?: number }> = {},
  ): void {
    this.eventCounter += 1;
    this.events.push({
      id: this.eventCounter,
      tick: this.tick,
      type,
      message,
      ...(details.position === undefined ? {} : { position: { ...details.position } }),
      ...(details.origin === undefined ? {} : { origin: { ...details.origin } }),
      ...(details.amount === undefined ? {} : { amount: details.amount }),
    });
  }
}
