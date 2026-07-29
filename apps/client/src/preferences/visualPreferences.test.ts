import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VisualPreferences } from './visualPreferences.js';

const modulePath = './visualPreferences.js';

type MemoryStorage = Pick<Storage, 'getItem' | 'setItem'>;

function createStorage(initial: Record<string, string> = {}): MemoryStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

async function loadPreferences(options: { storage?: MemoryStorage; document?: Document } = {}) {
  vi.resetModules();
  vi.unstubAllGlobals();
  if (options.storage !== undefined) {
    vi.stubGlobal('window', { localStorage: options.storage });
  }
  if (options.document !== undefined) {
    vi.stubGlobal('document', options.document);
  }
  return import(modulePath);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('visual preferences', () => {
  it('uses the blue and violet defaults when no browser storage is available', async () => {
    const preferences = await loadPreferences();

    expect(preferences.getVisualPreferences()).toEqual(preferences.DEFAULT_VISUAL_PREFERENCES);
    expect(preferences.DEFAULT_VISUAL_PREFERENCES.accentColor).toBe('#7C83FF');
    expect(preferences.DEFAULT_VISUAL_PREFERENCES.accentSecondaryColor).toBe('#B794F4');
  });

  it('ignores malformed persisted JSON', async () => {
    const preferences = await loadPreferences({
      storage: createStorage({ 'village-survivor.visual-preferences': '{not json' }),
    });

    expect(preferences.getVisualPreferences()).toEqual(preferences.DEFAULT_VISUAL_PREFERENCES);
  });

  it('persists, applies, and notifies a valid update', async () => {
    const storage = createStorage();
    const setProperty = vi.fn();
    const document = { documentElement: { style: { setProperty } } } as unknown as Document;
    const preferences = await loadPreferences({ storage, document });
    const listener = vi.fn();
    preferences.subscribeVisualPreferences(listener);

    const updated = preferences.updateVisualPreferences({ accentColor: '#12ab34' });

    expect(updated.accentColor).toBe('#12AB34');
    expect(storage.getItem('village-survivor.visual-preferences')).toContain('"#12AB34"');
    expect(setProperty).toHaveBeenCalledWith('--visual-accent-color', '#12AB34');
    expect(listener).toHaveBeenCalledWith(updated);
  });

  it('rejects non-hex colours without replacing the saved preference', async () => {
    const preferences = await loadPreferences({ storage: createStorage() });
    preferences.updateVisualPreferences({ accentColor: '#112233' });

    const updated = preferences.updateVisualPreferences({
      accentColor: 'red',
    } as Partial<VisualPreferences>);

    expect(updated.accentColor).toBe('#112233');
    expect(preferences.isValidVisualColor('#00ff00')).toBe(true);
    expect(preferences.isValidVisualColor('#0f0')).toBe(false);
  });

  it('resets the stored values and supports unsubscribe', async () => {
    const storage = createStorage();
    const preferences = await loadPreferences({ storage });
    const listener = vi.fn();
    const unsubscribe = preferences.subscribeVisualPreferences(listener);

    preferences.updateVisualPreferences({ hudColor: '#112233' });
    unsubscribe();
    preferences.resetVisualPreferences();

    expect(preferences.getVisualPreferences()).toEqual(preferences.DEFAULT_VISUAL_PREFERENCES);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(storage.getItem('village-survivor.visual-preferences')).toContain('"#C4B5FD"');
  });
});
