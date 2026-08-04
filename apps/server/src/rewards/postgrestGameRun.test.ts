import { describe, expect, it, vi } from 'vitest';

import { GameRunFinalizationError, PostgrestGameRunFinalizer } from './postgrestGameRun.js';

describe('finalisation serveur des récompenses', () => {
  it('envoie uniquement le run et les montants au RPC avec service_role', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    const finalizer = new PostgrestGameRunFinalizer(
      'http://postgrest.test',
      'service-role-secret',
      request,
    );
    await finalizer.finalize('run-id', [
      { userId: 'user-1', amount: 7 },
      { userId: 'user-2', amount: 0 },
    ]);
    expect(request).toHaveBeenCalledWith(
      'http://postgrest.test/rpc/finalize_game_run',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          p_run_id: 'run-id',
          p_rewards: [
            { user_id: 'user-1', amount: 7 },
            { user_id: 'user-2', amount: 0 },
          ],
        }),
      }),
    );
  });

  it('refuse les montants invalides avant tout appel réseau', async () => {
    const request = vi.fn<typeof fetch>();
    const finalizer = new PostgrestGameRunFinalizer('http://postgrest.test', 'secret', request);
    await expect(finalizer.finalize('run-id', [{ userId: 'user-1', amount: -1 }])).rejects.toThrow(
      GameRunFinalizationError,
    );
    expect(request).not.toHaveBeenCalled();
  });

  it('transforme une panne PostgREST en erreur fermée', async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error('network down'));
    const finalizer = new PostgrestGameRunFinalizer('http://postgrest.test', 'secret', request);
    await expect(finalizer.finalize('run-id', [])).rejects.toThrow(GameRunFinalizationError);
  });

  it('abandonne un appel bloqué après quatre secondes pour permettre le retry', async () => {
    vi.useFakeTimers();
    const request = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const finalizer = new PostgrestGameRunFinalizer('http://postgrest.test', 'secret', request);
    const pending = finalizer.finalize('run-id', []);
    await vi.advanceTimersByTimeAsync(4_000);
    await expect(pending).rejects.toThrow(GameRunFinalizationError);
    vi.useRealTimers();
  });
});
