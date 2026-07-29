/** The colours shared by the interface, HUD, and player-facing game visuals. */
export type VisualPreferences = Readonly<{
  accentColor: string;
  accentSecondaryColor: string;
  playerColor: string;
  playerProjectileColor: string;
  turretColor: string;
  hudColor: string;
}>;

export type VisualPreferencesListener = (preferences: VisualPreferences) => void;

export const VISUAL_PREFERENCES_STORAGE_KEY = 'village-survivor.visual-preferences';

export const DEFAULT_VISUAL_PREFERENCES: VisualPreferences = Object.freeze({
  accentColor: '#7C83FF',
  accentSecondaryColor: '#B794F4',
  playerColor: '#63B3ED',
  playerProjectileColor: '#A5F3FC',
  turretColor: '#A78BFA',
  hudColor: '#C4B5FD',
});

const preferenceKeys = Object.freeze([
  'accentColor',
  'accentSecondaryColor',
  'playerColor',
  'playerProjectileColor',
  'turretColor',
  'hudColor',
] as const);

type VisualPreferenceKey = (typeof preferenceKeys)[number];

const cssVariables: Readonly<Record<VisualPreferenceKey, string>> = {
  accentColor: '--visual-accent-color',
  accentSecondaryColor: '--visual-accent-secondary-color',
  playerColor: '--visual-player-color',
  playerProjectileColor: '--visual-player-projectile-color',
  turretColor: '--visual-turret-color',
  hudColor: '--visual-hud-color',
};

const listeners = new Set<VisualPreferencesListener>();

/** Accept only CSS hex colours with an explicit opaque RGB component. */
export function isValidVisualColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

function normalizeColor(value: string): string {
  return value.toUpperCase();
}

function normalizePreferences(value: unknown): VisualPreferences {
  const candidate =
    value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized: Record<VisualPreferenceKey, string> = {
    ...DEFAULT_VISUAL_PREFERENCES,
  };

  for (const key of preferenceKeys) {
    const color = (candidate as Partial<Record<VisualPreferenceKey, unknown>>)[key];
    if (isValidVisualColor(color)) {
      normalized[key] = normalizeColor(color);
    }
  }

  return Object.freeze(normalized);
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStoredPreferences(): VisualPreferences {
  const storage = getStorage();
  if (storage === null) {
    return DEFAULT_VISUAL_PREFERENCES;
  }

  try {
    const stored = storage.getItem(VISUAL_PREFERENCES_STORAGE_KEY);
    return stored === null ? DEFAULT_VISUAL_PREFERENCES : normalizePreferences(JSON.parse(stored));
  } catch {
    return DEFAULT_VISUAL_PREFERENCES;
  }
}

function persistPreferences(preferences: VisualPreferences): void {
  const storage = getStorage();
  if (storage === null) {
    return;
  }

  try {
    storage.setItem(VISUAL_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Private browsing and full quotas must not prevent the current session from updating.
  }
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener(currentPreferences);
  }
}

let currentPreferences = readStoredPreferences();

/**
 * Writes the theme tokens to the root element. It is intentionally safe for SSR
 * and unit tests where the DOM is unavailable.
 */
export function applyVisualPreferences(preferences: VisualPreferences): void {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  if (root === null) {
    return;
  }

  const normalized = normalizePreferences(preferences);
  for (const key of preferenceKeys) {
    root.style.setProperty(cssVariables[key], normalized[key]);
  }
}

/** Re-reads persisted values and applies them to the document, if one exists. */
export function hydrateVisualPreferences(): VisualPreferences {
  currentPreferences = readStoredPreferences();
  applyVisualPreferences(currentPreferences);
  return currentPreferences;
}

export function getVisualPreferences(): VisualPreferences {
  return currentPreferences;
}

/**
 * Updates valid colour fields only. Invalid values are ignored so a malformed
 * form value cannot erase an otherwise usable saved preference.
 */
export function updateVisualPreferences(partial: Partial<VisualPreferences>): VisualPreferences {
  const validUpdates: Partial<Record<VisualPreferenceKey, string>> = {};
  for (const key of preferenceKeys) {
    const color = partial[key];
    if (isValidVisualColor(color)) {
      validUpdates[key] = normalizeColor(color);
    }
  }

  const next = normalizePreferences({ ...currentPreferences, ...validUpdates });
  if (preferenceKeys.every((key) => next[key] === currentPreferences[key])) {
    return currentPreferences;
  }

  currentPreferences = next;
  persistPreferences(currentPreferences);
  applyVisualPreferences(currentPreferences);
  notifyListeners();
  return currentPreferences;
}

export function resetVisualPreferences(): VisualPreferences {
  if (currentPreferences === DEFAULT_VISUAL_PREFERENCES) {
    applyVisualPreferences(currentPreferences);
    return currentPreferences;
  }

  currentPreferences = DEFAULT_VISUAL_PREFERENCES;
  persistPreferences(currentPreferences);
  applyVisualPreferences(currentPreferences);
  notifyListeners();
  return currentPreferences;
}

export function subscribeVisualPreferences(listener: VisualPreferencesListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Apply the persisted or default palette as soon as this module is imported.
applyVisualPreferences(currentPreferences);
