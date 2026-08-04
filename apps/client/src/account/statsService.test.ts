import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
}));

vi.mock('./supabaseClient.js', () => ({
  supabase: {
    auth: { getUser: supabaseMock.getUser },
    from: supabaseMock.from,
  },
}));

import { statsService } from './statsService.js';

function mockWalletRead(data: unknown, error: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn().mockReturnValue({ single });
  const select = vi.fn().mockReturnValue({ eq });
  supabaseMock.from.mockReturnValue({ select });
  return { select, eq, single };
}

describe("portefeuille d'or du compte", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.getUser.mockResolvedValue({
      data: { user: { id: 'account-1' } },
      error: null,
    });
  });

  it('charge uniquement le portefeuille du compte authentifié', async () => {
    const query = mockWalletRead({ balance: 42 });

    await expect(statsService.loadAccountGold()).resolves.toBe(42);
    expect(supabaseMock.from).toHaveBeenCalledWith('account_gold_wallets');
    expect(query.select).toHaveBeenCalledWith('balance');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'account-1');
  });

  it('refuse le chargement sans compte authentifié', async () => {
    supabaseMock.getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(statsService.loadAccountGold()).rejects.toThrow('connecté');
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('propage une erreur lisible de chargement Supabase', async () => {
    mockWalletRead(null, new Error('database unavailable'));

    await expect(statsService.loadAccountGold()).rejects.toThrow(
      "Échec du chargement du solde d'or : database unavailable",
    );
  });
});
