import { supabase } from './supabaseClient.js';
import type { GameRunSummary, PlayerStats } from './types.js';

export interface StatsService {
  /** Charge les stats du joueur connecté. */
  loadStats(): Promise<PlayerStats>;
  /** Enregistre le résultat d'une partie (incrémente les compteurs de façon atomique côté base). */
  recordGameResult(summary: GameRunSummary): Promise<void>;
}

/** Ligne brute renvoyée par la table player_stats. */
interface PlayerStatsRow {
  games_played: number;
  games_won: number;
  games_lost: number;
  total_play_ms: number;
  best_cycle: number;
  max_player_level: number;
  wood_gathered: number;
  stone_gathered: number;
  iron_gathered: number;
  gold_gathered: number;
  diamond_gathered: number;
}

function toError(message: string, cause: unknown): Error {
  if (cause instanceof Error) {
    return new Error(`${message} : ${cause.message}`);
  }
  return new Error(message);
}

function mapRow(row: PlayerStatsRow): PlayerStats {
  return {
    gamesPlayed: row.games_played,
    gamesWon: row.games_won,
    gamesLost: row.games_lost,
    totalPlayMs: row.total_play_ms,
    bestCycle: row.best_cycle,
    maxPlayerLevel: row.max_player_level,
    resourcesGathered: {
      wood: row.wood_gathered,
      stone: row.stone_gathered,
      iron: row.iron_gathered,
      gold: row.gold_gathered,
      diamond: row.diamond_gathered,
    },
  };
}

class SupabaseStatsService implements StatsService {
  async loadStats(): Promise<PlayerStats> {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      throw new Error('Vous devez être connecté pour charger vos statistiques.');
    }

    const { data, error } = await supabase
      .from('player_stats')
      .select(
        'games_played, games_won, games_lost, total_play_ms, best_cycle, max_player_level, ' +
          'wood_gathered, stone_gathered, iron_gathered, gold_gathered, diamond_gathered',
      )
      .eq('user_id', userData.user.id)
      .single<PlayerStatsRow>();

    if (error) {
      throw toError('Échec du chargement des statistiques', error);
    }

    return mapRow(data);
  }

  async recordGameResult(summary: GameRunSummary): Promise<void> {
    const { error } = await supabase.rpc('record_game_result', {
      p_won: summary.won,
      p_duration_ms: summary.durationMs,
      p_cycle: summary.cycleReached,
      p_level: summary.playerLevel,
      p_wood: summary.resourcesGathered.wood,
      p_stone: summary.resourcesGathered.stone,
      p_iron: summary.resourcesGathered.iron,
      p_gold: summary.resourcesGathered.gold,
      p_diamond: summary.resourcesGathered.diamond,
    });

    if (error) {
      throw toError("Échec de l'enregistrement du résultat de la partie", error);
    }
  }
}

export const statsService: StatsService = new SupabaseStatsService();
