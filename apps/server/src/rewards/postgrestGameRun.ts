export interface GameRunReward {
  userId: string;
  amount: number;
}

const FINALIZATION_TIMEOUT_MS = 4_000;

export interface GameRunFinalizer {
  finalize(runId: string, rewards: readonly GameRunReward[]): Promise<void>;
}

export class GameRunFinalizationError extends Error {
  public constructor() {
    super('La finalisation des récompenses a échoué.');
    this.name = 'GameRunFinalizationError';
  }
}

function validReward(reward: GameRunReward): boolean {
  return (
    typeof reward.userId === 'string' &&
    reward.userId.length > 0 &&
    reward.userId.length <= 128 &&
    Number.isSafeInteger(reward.amount) &&
    reward.amount >= 0
  );
}

export class PostgrestGameRunFinalizer implements GameRunFinalizer {
  public constructor(
    private readonly baseUrl: string,
    private readonly serviceRoleKey: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  public async finalize(runId: string, rewards: readonly GameRunReward[]): Promise<void> {
    if (
      runId.length === 0 ||
      runId.length > 128 ||
      rewards.length > 10 ||
      rewards.some((reward) => !validReward(reward))
    ) {
      throw new GameRunFinalizationError();
    }
    try {
      const response = await this.request(`${this.baseUrl}/rpc/finalize_game_run`, {
        method: 'POST',
        headers: {
          apikey: this.serviceRoleKey,
          authorization: `Bearer ${this.serviceRoleKey}`,
          'content-type': 'application/json',
        },
        signal: AbortSignal.timeout(FINALIZATION_TIMEOUT_MS),
        body: JSON.stringify({
          p_run_id: runId,
          p_rewards: rewards.map(({ userId, amount }) => ({ user_id: userId, amount })),
        }),
      });
      if (!response.ok) throw new GameRunFinalizationError();
    } catch (error) {
      if (error instanceof GameRunFinalizationError) throw error;
      throw new GameRunFinalizationError();
    }
  }
}
