import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMock = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('./supabaseClient.js', () => ({
  supabase: {
    auth: { getUser: supabaseMock.getUser },
    from: supabaseMock.from,
    rpc: supabaseMock.rpc,
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

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'refuse un crédit non sûr ou négatif (%s)',
    async (amount) => {
      await expect(statsService.creditAccountGold(amount)).rejects.toThrow('entier sûr');
      expect(supabaseMock.rpc).not.toHaveBeenCalled();
    },
  );

  it('crédite atomiquement via la RPC et renvoie le nouveau solde', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 107, error: null });

    await expect(statsService.creditAccountGold(7)).resolves.toBe(107);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('credit_account_gold', {
      p_amount: 7,
    });
  });

  it('accepte un crédit nul sans produire de nombre négatif', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: 100, error: null });

    await expect(statsService.creditAccountGold(0)).resolves.toBe(100);
  });

  it('refuse un solde RPC qui ne peut pas être représenté sûrement', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: Number.MAX_SAFE_INTEGER + 1, error: null });

    await expect(statsService.creditAccountGold(1)).rejects.toThrow('solde');
  });

  it('propage une erreur lisible de crédit Supabase', async () => {
    supabaseMock.rpc.mockResolvedValue({ data: null, error: new Error('rpc failed') });

    await expect(statsService.creditAccountGold(5)).rejects.toThrow(
      "Impossible de créditer l'or du compte : rpc failed",
    );
  });
});
