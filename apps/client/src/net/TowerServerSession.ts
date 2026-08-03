import { Client, type Room } from '@colyseus/sdk';
import type {
  CreateTowerRoomRequest,
  CreateTowerRoomResponse,
  TowerActionMessage,
  TowerEvent,
  TowerEventsMessage,
  TowerGameState,
  TowerInput,
  TowerPlayerState,
  TowerProjectileState,
  TowerRoomError,
  TowerSharedGameState,
  TowerWeaponId,
  TurretState,
  Vector2,
} from '@village-survivor/protocol';

import { supabase } from '../account/supabaseClient.js';
import type { TowerRenderableSession } from './towerSession.js';

const SERVER_TICK_MS = 50;
const CONTROL_INTERVAL_MS = 1_000 / 30;
const ACTION_LIMIT_PER_SECOND = 10;
const MAX_PENDING_ACTIONS = 16;
const MAX_REMEMBERED_ACTION_IDS = 256;
const MAX_PREDICTION_TICKS = 2;
const VISUAL_PLAYER_SPEED_PER_SECOND = 260;
export const TOWER_SERVER_ROOM_KEY = 'vs-server-room';

export type TowerServerSessionOptions = Readonly<{ roomId?: string }>;

interface WireState extends Omit<
  TowerSharedGameState,
  'seed' | 'players' | 'turrets' | 'monsters' | 'projectiles' | 'scraps' | 'globalDefenseUpgrades'
> {
  phase: string;
  players: unknown;
  turrets: unknown;
  monsters: unknown;
  projectiles: unknown;
  scraps: unknown;
  globalDefenseUpgrades: unknown;
}

function collectionValues<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'object' && value !== null) return Object.values(value) as T[];
  return [];
}

function normalizePlayer(player: TowerPlayerState): TowerPlayerState {
  const { nearTurret, turretWorkshopProtected, ...required } = player;
  return {
    ...required,
    weapons: collectionValues(player.weapons),
    upgradeChoices: collectionValues(player.upgradeChoices).map((choice) => {
      const card = choice as TowerPlayerState['upgradeChoices'][number];
      if ((card.weaponId as string | undefined) === '') {
        return {
          offerId: card.offerId,
          upgradeId: card.upgradeId,
          rarity: card.rarity,
          label: card.label,
          description: card.description,
        };
      }
      return card;
    }),
    ...(nearTurret === undefined || (nearTurret as string) === '' ? {} : { nearTurret }),
    ...(turretWorkshopProtected === true ? { turretWorkshopProtected: true } : {}),
  };
}

function normalizeProjectile(projectile: TowerProjectileState): TowerProjectileState {
  const { ownerId, weaponId, ...required } = projectile;
  return {
    ...required,
    ...(ownerId === undefined || ownerId === '' ? {} : { ownerId }),
    ...(weaponId === undefined || (weaponId as string) === '' ? {} : { weaponId }),
  };
}

/** Reconstruit uniquement l'alias local `player`; aucun état n'est accepté du navigateur. */
export function towerGameStateFromWire(
  value: unknown,
  localUserId: string,
  events: TowerGameState['events'] = [],
): TowerGameState {
  if (typeof value !== 'object' || value === null) throw new Error('État serveur invalide.');
  const wire = value as WireState;
  const players = collectionValues<TowerPlayerState>(wire.players).map(normalizePlayer);
  const player = players.find(({ id }) => id === localUserId);
  if (player === undefined) throw new Error('Avatar local absent de l’état serveur.');
  const { turrets, monsters, projectiles, scraps, globalDefenseUpgrades } = wire;
  const shared = { ...wire } as Record<string, unknown>;
  delete shared.phase;
  delete shared.seed;
  delete shared.players;
  delete shared.turrets;
  delete shared.monsters;
  delete shared.projectiles;
  delete shared.scraps;
  delete shared.globalDefenseUpgrades;
  return {
    ...(shared as Omit<
      TowerSharedGameState,
      | 'seed'
      | 'players'
      | 'turrets'
      | 'monsters'
      | 'projectiles'
      | 'scraps'
      | 'globalDefenseUpgrades'
    >),
    seed: 'server-authoritative',
    globalDefenseUpgrades: collectionValues(globalDefenseUpgrades),
    player,
    players,
    turrets: collectionValues<TurretState>(turrets).map((turret) => ({
      ...turret,
      modules: collectionValues(turret.modules),
    })),
    monsters: collectionValues(monsters),
    projectiles: collectionValues<TowerProjectileState>(projectiles).map(normalizeProjectile),
    scraps: collectionValues(scraps),
    events,
  };
}

export function gameServerEndpoint(): string {
  const configured = import.meta.env.VITE_GAME_SERVER_URL as string | undefined;
  if (configured !== undefined && configured.length > 0) return configured.replace(/\/$/u, '');
  if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
    return `${location.protocol}//${location.hostname}:2567`;
  }
  return `${location.origin}/game`;
}

function responseError(value: unknown): string {
  if (typeof value === 'object' && value !== null && 'message' in value) {
    const message = (value as TowerRoomError).message;
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return 'Le serveur de jeu ne peut pas démarrer la partie.';
}

async function currentGameIdentity(): Promise<
  Readonly<{
    userId: string;
    accessToken: string;
  }>
> {
  const { data, error } = await supabase.auth.getSession();
  const authSession = data.session;
  if (error !== null || authSession === null) {
    throw new Error('Votre session a expiré. Reconnectez-vous avant de lancer une partie.');
  }
  return { userId: authSession.user.id, accessToken: authSession.access_token };
}

export async function createTowerServerRoom(
  request: CreateTowerRoomRequest,
): Promise<CreateTowerRoomResponse> {
  const identity = await currentGameIdentity();
  const response = await fetch(`${gameServerEndpoint()}/rooms`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${identity.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(request),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || typeof body !== 'object' || body === null || !('roomId' in body)) {
    throw new Error(responseError(body));
  }
  return body as CreateTowerRoomResponse;
}

export function towerActionsFromInput(
  input: TowerInput,
  createActionId: () => string,
): TowerActionMessage[] {
  const actions: TowerActionMessage[] = [];
  if (input.selectUpgradeId !== undefined) {
    const actionId = input.discreteActionId ?? createActionId();
    if (input.selectUpgradeId.startsWith('weapon:')) {
      actions.push({
        type: 'weapon',
        actionId,
        weaponId: input.selectUpgradeId.slice('weapon:'.length) as TowerWeaponId,
      });
    } else {
      actions.push({ type: 'level', actionId, offerId: input.selectUpgradeId });
    }
  }
  if (input.turretShop !== undefined) {
    actions.push({
      type: 'shop',
      actionId: input.discreteActionId ?? createActionId(),
      turret: input.turretShop.turret,
      action: input.turretShop.action as Extract<TowerActionMessage, { type: 'shop' }>['action'],
    });
  }
  return actions;
}

export function predictTowerLocalPosition(
  playerPosition: Vector2,
  world: Readonly<{ width: number; height: number }>,
  input: Pick<TowerInput, 'moveX' | 'moveY'>,
  requestedLeadTicks: number,
): Vector2 {
  const length = Math.hypot(input.moveX, input.moveY);
  if (length === 0) return playerPosition;
  const leadTicks = Math.min(MAX_PREDICTION_TICKS, Math.max(0, requestedLeadTicks));
  const distance = VISUAL_PLAYER_SPEED_PER_SECOND * (SERVER_TICK_MS / 1_000) * leadTicks;
  const halfWidth = world.width / 2 - 16;
  const halfHeight = world.height / 2 - 16;
  return {
    x: Math.max(
      -halfWidth,
      Math.min(halfWidth, playerPosition.x + (input.moveX / Math.max(1, length)) * distance),
    ),
    y: Math.max(
      -halfHeight,
      Math.min(halfHeight, playerPosition.y + (input.moveY / Math.max(1, length)) * distance),
    ),
  };
}

export function appendUnseenTowerEvents(
  pending: readonly TowerEvent[],
  knownIds: Set<number>,
  incoming: readonly TowerEvent[],
): TowerEvent[] {
  const merged = [...pending];
  for (const event of incoming) {
    if (knownIds.has(event.id)) continue;
    knownIds.add(event.id);
    merged.push(event);
  }
  return merged;
}

export class TowerServerSession implements TowerRenderableSession {
  private room: Room | undefined;
  private localUserId = '';
  private latestState?: TowerGameState;
  private latestStateAtMs = 0;
  private latestInput?: TowerInput;
  private lastControlAtMs = Number.NEGATIVE_INFINITY;
  private readonly listeners = new Set<(state: TowerGameState) => void>();
  private readonly connectionListeners = new Set<(message: string, terminal?: boolean) => void>();
  private readonly pendingActions: TowerActionMessage[] = [];
  private readonly sentActionIds = new Set<string>();
  private readonly sentActionOrder: string[] = [];
  private readonly actionTimesMs: number[] = [];
  private readonly eventIds = new Set<number>();
  private pendingEvents: TowerGameState['events'] = [];
  private nextActionId = 0;
  private stopped = false;
  private announcedWaiting = false;
  private announcedAbandoned = false;

  public constructor(private readonly options: TowerServerSessionOptions = {}) {}

  public async start(): Promise<void> {
    const identity = await currentGameIdentity();
    this.localUserId = identity.userId;
    const endpoint = gameServerEndpoint();
    const roomId = this.options.roomId ?? (await createTowerServerRoom({ mode: 'solo' })).roomId;
    const client = new Client(endpoint);
    client.auth.token = identity.accessToken;
    const room = await client.joinById(roomId);
    if (this.stopped) {
      await room.leave();
      return;
    }
    this.room = room;
    room.reconnection.minUptime = 0;
    room.reconnection.maxRetries = 13;
    room.reconnection.minDelay = 100;
    room.reconnection.maxDelay = 5_000;
    room.onMessage('events', (message: TowerEventsMessage) => {
      this.pendingEvents = appendUnseenTowerEvents(
        this.pendingEvents,
        this.eventIds,
        message.events,
      );
    });
    room.onMessage('command-rejected', () => {
      this.emitConnectionIssue('Une commande a été refusée par le serveur.');
    });
    room.onError(() => {
      this.emitConnectionIssue('La connexion au serveur de jeu a rencontré une erreur.');
    });
    room.onDrop(() => {
      if (!this.stopped)
        this.emitConnectionIssue('Reconnexion automatique en cours (30 secondes maximum)…');
    });
    room.onReconnect(() => {
      if (!this.stopped) this.emitConnectionIssue('Connexion rétablie.');
    });
    room.onLeave(() => {
      if (!this.stopped)
        this.emitConnectionIssue('La partie serveur est terminée ou inaccessible.', true);
    });
    room.onStateChange((state: Readonly<{ toJSON(): unknown }>) => {
      try {
        const wire = state.toJSON();
        const phase =
          typeof wire === 'object' && wire !== null && 'phase' in wire
            ? (wire as { phase?: unknown }).phase
            : undefined;
        if (phase === 'waiting') {
          if (!this.announcedWaiting) {
            this.announcedWaiting = true;
            this.emitConnectionIssue('En attente de tous les membres réservés (15 secondes)…');
          }
          return;
        }
        this.announcedWaiting = false;
        if (phase === 'abandoned') {
          if (!this.announcedAbandoned) {
            this.announcedAbandoned = true;
            this.emitConnectionIssue('La partie a été abandonnée.', true);
          }
          return;
        }
        const snapshot = towerGameStateFromWire(wire, this.localUserId, this.pendingEvents);
        this.pendingEvents = [];
        this.latestState = snapshot;
        this.latestStateAtMs = performance.now();
        for (const listener of this.listeners) listener(snapshot);
      } catch {
        this.emitConnectionIssue('Le serveur a envoyé un état de jeu invalide.', true);
      }
    });
  }

  public async stop(): Promise<void> {
    this.stopped = true;
    const room = this.room;
    this.room = undefined;
    if (room !== undefined) await room.leave();
  }

  public sendInput(input: TowerInput): void {
    this.latestInput = input;
    const room = this.room;
    if (room === undefined) return;
    const nowMs = performance.now();
    if (nowMs - this.lastControlAtMs >= CONTROL_INTERVAL_MS) {
      this.lastControlAtMs = nowMs;
      room.sendUnreliable('control', {
        sequence: input.sequence,
        moveX: input.moveX,
        moveY: input.moveY,
        aimX: input.aimX,
        aimY: input.aimY,
        ...(input.fire === true ? { fire: true } : {}),
        ...(input.turretWorkshopOpen === true ? { turretWorkshopOpen: true } : {}),
      });
    }
    for (const action of towerActionsFromInput(input, () => this.createActionId())) {
      if (
        this.sentActionIds.has(action.actionId) ||
        this.pendingActions.some(({ actionId }) => actionId === action.actionId)
      )
        continue;
      if (this.pendingActions.length < MAX_PENDING_ACTIONS) this.pendingActions.push(action);
    }
    this.flushActions(nowMs);
  }

  public subscribe(listener: (state: TowerGameState) => void): () => void {
    this.listeners.add(listener);
    if (this.latestState !== undefined) listener(this.latestState);
    return () => this.listeners.delete(listener);
  }

  public getRenderAlpha(): number {
    if (this.latestState === undefined) return 1;
    return Math.max(0, Math.min(1, (performance.now() - this.latestStateAtMs) / SERVER_TICK_MS));
  }

  public getLocalRenderPosition(): Vector2 | undefined {
    const state = this.latestState;
    const input = this.latestInput;
    if (state === undefined || input === undefined || (input.moveX === 0 && input.moveY === 0))
      return undefined;
    const leadTicks = Math.min(
      MAX_PREDICTION_TICKS,
      Math.max(0, (performance.now() - this.latestStateAtMs) / SERVER_TICK_MS),
    );
    return predictTowerLocalPosition(state.player.position, state.world, input, leadTicks);
  }

  public onConnectionIssue(listener: (message: string, terminal?: boolean) => void): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  private createActionId(): string {
    this.nextActionId += 1;
    return `server-action-${this.nextActionId}`;
  }

  private flushActions(nowMs: number): void {
    while (this.actionTimesMs[0] !== undefined && this.actionTimesMs[0] <= nowMs - 1_000)
      this.actionTimesMs.shift();
    while (
      this.room !== undefined &&
      this.pendingActions.length > 0 &&
      this.actionTimesMs.length < ACTION_LIMIT_PER_SECOND
    ) {
      const action = this.pendingActions.shift();
      if (action === undefined) break;
      this.room.send('action', action);
      this.actionTimesMs.push(nowMs);
      this.sentActionIds.add(action.actionId);
      this.sentActionOrder.push(action.actionId);
      const forgotten =
        this.sentActionOrder.length > MAX_REMEMBERED_ACTION_IDS
          ? this.sentActionOrder.shift()
          : undefined;
      if (forgotten !== undefined) this.sentActionIds.delete(forgotten);
    }
  }

  private emitConnectionIssue(message: string, terminal = false): void {
    for (const listener of this.connectionListeners) listener(message, terminal);
  }
}
