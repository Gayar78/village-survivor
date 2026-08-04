import type {
  TowerEvent,
  TowerGameState,
  TowerGlobalDefenseOfferId,
  TowerSuperModuleId,
  TowerWeaponId,
  TurretDir,
  TurretModuleId,
  TurretTargetPriority,
} from './tower.js';

/** Phase de cycle de vie de la room, distincte du statut de la simulation Tower. */
export type TowerRoomPhase = 'waiting' | 'running' | 'defeat' | 'abandoned';

export type CreateTowerRoomRequest =
  Readonly<{ mode: 'solo' }> | Readonly<{ mode: 'coop'; rosterUserIds: readonly string[] }>;

export type CreateTowerRoomResponse = Readonly<{
  roomId: string;
  expiresAt: string;
}>;

export type TowerRoomErrorCode =
  | 'unauthorized'
  | 'invalid-request'
  | 'invalid-roster'
  | 'not-in-roster'
  | 'already-connected'
  | 'room-full'
  | 'room-expired'
  | 'server-unavailable'
  | 'dependency-unavailable'
  | 'rate-limited';

export type TowerRoomError = Readonly<{
  code: TowerRoomErrorCode;
  message: string;
}>;

/** Commande continue. Elle ne transporte aucune position ni valeur calculée par le jeu. */
export type TowerControlMessage = Readonly<{
  sequence: number;
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  fire?: boolean;
  turretWorkshopOpen?: boolean;
}>;

export type TowerActionMessage =
  | Readonly<{ type: 'level'; actionId: string; offerId: string }>
  | Readonly<{ type: 'weapon'; actionId: string; weaponId: TowerWeaponId }>
  | Readonly<{
      type: 'shop';
      actionId: string;
      turret: TurretDir;
      action:
        | 'repair'
        | 'dmg'
        | 'range'
        | 'rate'
        | 'hp'
        | 'energy'
        | 'maxenergy'
        | `module:${TurretModuleId}`
        | `priority:${TurretTargetPriority}`
        | `global:${TowerGlobalDefenseOfferId}`
        | `module:${TowerSuperModuleId}`;
    }>;

/** État partagé sur le fil : l'alias local `player` et les événements en sont exclus. */
export type TowerSharedGameState = Omit<TowerGameState, 'player' | 'events'>;

export type TowerRoomState = TowerSharedGameState & Readonly<{ phase: TowerRoomPhase }>;

export type TowerEventsMessage = Readonly<{ events: readonly TowerEvent[] }>;

export type TowerCommandRejectionCode =
  'malformed' | 'stale-sequence' | 'rate-limited' | 'queue-full' | 'duplicate-action';

export type TowerCommandRejectedMessage = Readonly<{
  command: 'control' | 'action';
  code: TowerCommandRejectionCode;
}>;

export type TowerConnectionState =
  'idle' | 'creating-room' | 'joining-room' | 'connected' | 'reconnecting' | 'closed' | 'error';
