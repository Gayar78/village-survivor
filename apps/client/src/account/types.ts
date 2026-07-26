import type { ResourceType } from '@village-survivor/protocol';

export interface AccountSession {
  userId: string;
  email: string;
  displayName: string;
}

export interface PlayerStats {
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  totalPlayMs: number;
  bestCycle: number;
  maxPlayerLevel: number;
  resourcesGathered: Record<ResourceType, number>;
}

export interface GameRunSummary {
  won: boolean;
  durationMs: number;
  cycleReached: number;
  playerLevel: number;
  resourcesGathered: Record<ResourceType, number>;
}

/** Données d'enrôlement TOTP. `qrCode` est une source prête pour <img src="..."> (data URL SVG renvoyée par Supabase). */
export interface MfaEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}
