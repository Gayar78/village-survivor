import { describe, expect, it, vi } from 'vitest';

import { MetaBuildDependencyError, PostgrestMetaBuildRepository } from './postgrestMetaBuild.js';

const ACTIVE_PROFILE = {
  id: 'profile-1',
  name: 'Gardien',
  blessing_path_id: 'hunter',
  blessing_budget: 4,
  blessing_ranks: { 'keen-rounds': 1 },
  skill_slots: ['suppressive-fire', null, null],
  gem_slots: ['ember', null, null],
  is_default: true,
  is_active: true,
};

describe('chargement serveur du build méta', () => {
  it('utilise la clé service_role et résout le profil actif avec les rangs possédés', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([ACTIVE_PROFILE]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ skill_id: 'suppressive-fire', rank: 2 }]), { status: 200 }),
      );
    const repository = new PostgrestMetaBuildRepository(
      'http://postgrest.test',
      'service-key',
      request,
    );
    const build = await repository.loadActiveBuild('user/with-special');
    expect(build.damageMultiplier).toBeGreaterThan(1);
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0]?.[0]).toContain('user_id=eq.user%2Fwith-special');
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      headers: { apikey: 'service-key', authorization: 'Bearer service-key' },
    });
  });

  it('refuse de démarrer lorsque PostgREST ou le profil actif est indisponible', async () => {
    const failedRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{}', { status: 503 }));
    await expect(
      new PostgrestMetaBuildRepository(
        'http://postgrest.test',
        'service-key',
        failedRequest,
      ).loadActiveBuild('user-1'),
    ).rejects.toBeInstanceOf(MetaBuildDependencyError);

    const missingProfileRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('[]', { status: 200 }))
      .mockResolvedValueOnce(new Response('[]', { status: 200 }));
    await expect(
      new PostgrestMetaBuildRepository(
        'http://postgrest.test',
        'service-key',
        missingProfileRequest,
      ).loadActiveBuild('user-1'),
    ).rejects.toBeInstanceOf(MetaBuildDependencyError);
  });
});
