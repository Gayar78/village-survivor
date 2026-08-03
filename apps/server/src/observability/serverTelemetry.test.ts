import type { Logger } from '@opentelemetry/api-logs';
import { describe, expect, it, vi } from 'vitest';

import { ServerLogger } from './serverTelemetry.js';

describe('observabilité serveur hors chemin critique', () => {
  it('respecte APP_LOG_LEVEL et ne produit aucune donnée sous le seuil', () => {
    const emit = vi.fn();
    const logger = new ServerLogger('warn', { emit } as unknown as Logger);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    logger.emit('info', 'ignoré');
    logger.emit('warn', 'conservé', { 'game.reason': 'test' });
    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledOnce();
    info.mockRestore();
    warn.mockRestore();
  });
});
