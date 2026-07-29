import {
  getVisualPreferences,
  resetVisualPreferences,
  subscribeVisualPreferences,
  updateVisualPreferences,
} from '../preferences/visualPreferences.js';
import type { VisualPreferences } from '../preferences/visualPreferences.js';
import './settings.css';

type PreferenceKey =
  | 'accentColor'
  | 'accentSecondaryColor'
  | 'playerColor'
  | 'playerProjectileColor'
  | 'turretColor'
  | 'hudColor';

interface ColorControl {
  key: PreferenceKey;
  label: string;
  hint: string;
  preview: string;
}

const COLOR_CONTROLS: readonly ColorControl[] = [
  {
    key: 'accentColor',
    label: 'Interface générale',
    hint: 'Couleur principale des cadres et actions.',
    preview: 'Cadre',
  },
  {
    key: 'accentSecondaryColor',
    label: 'Interface secondaire',
    hint: 'Couleur complémentaire des surfaces et états secondaires.',
    preview: 'Accent',
  },
  {
    key: 'playerColor',
    label: 'Joueur',
    hint: 'Teinte du survivant contrôlé.',
    preview: 'Joueur',
  },
  {
    key: 'playerProjectileColor',
    label: 'Munitions de base',
    hint: 'Teinte des projectiles tirés par le joueur.',
    preview: 'Munitions',
  },
  {
    key: 'turretColor',
    label: 'Tourelles',
    hint: 'Teinte des défenses construites.',
    preview: 'Tourelle',
  },
  {
    key: 'hudColor',
    label: 'Indicateurs HUD',
    hint: 'Teinte des jauges et repères à l’écran.',
    preview: 'HUD',
  },
];

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

/** Réglages locaux des couleurs, disponibles depuis le menu principal. */
export class SettingsScreen {
  private readonly element: HTMLElement;
  private readonly onClose: () => void;

  public constructor(element: HTMLElement, onClose: () => void) {
    this.element = element;
    this.onClose = onClose;
    this.element.classList.add('settings-screen');
    this.render();
    subscribeVisualPreferences((preferences) => this.applyPreferences(preferences));
  }

  public show(): void {
    this.element.classList.remove('settings-screen--hidden');
    this.applyPreferences(getVisualPreferences());
    this.element.querySelector<HTMLElement>('#settings-title')?.focus();
  }

  public hide(): void {
    this.element.classList.add('settings-screen--hidden');
  }

  private render(): void {
    this.element.innerHTML = `
      <section class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header class="settings-header">
          <div>
            <p class="settings-kicker">Atelier du survivant</p>
            <h2 id="settings-title" tabindex="-1">Paramètres de couleur</h2>
            <p class="settings-intro">Choisissez vos couleurs : les aperçus et le jeu se mettent à jour immédiatement sur cet appareil.</p>
          </div>
          <button type="button" class="settings-close" id="settings-close">Fermer</button>
        </header>

        <section class="settings-preview" aria-labelledby="settings-preview-title">
          <div>
            <p class="settings-kicker">Aperçu en direct</p>
            <h3 id="settings-preview-title">Votre palette</h3>
          </div>
          <div class="settings-preview__scene" aria-label="Aperçu des couleurs sélectionnées">
            ${COLOR_CONTROLS.map(
              (control) => `
                <div class="settings-preview__item" data-preview="${control.key}">
                  <i aria-hidden="true"></i>
                  <span>${control.preview}</span>
                </div>`,
            ).join('')}
          </div>
        </section>

        <form class="settings-controls" id="settings-form">
          <p class="settings-controls__hint">Saisissez une valeur hexadécimale au format <code>#RRGGBB</code> ou utilisez le sélecteur.</p>
          <div class="settings-controls__grid">
            ${COLOR_CONTROLS.map(
              (control) => `
                <fieldset class="settings-control" data-control="${control.key}">
                  <legend>${control.label}</legend>
                  <p id="settings-hint-${control.key}">${control.hint}</p>
                  <div class="settings-control__inputs">
                    <label class="settings-color-picker" for="settings-color-${control.key}">
                      <span class="sr-only">Choisir la couleur ${control.label}</span>
                      <input id="settings-color-${control.key}" type="color" aria-describedby="settings-hint-${control.key}" />
                    </label>
                    <label class="sr-only" for="settings-hex-${control.key}">Valeur hexadécimale ${control.label}</label>
                    <input id="settings-hex-${control.key}" class="settings-hex" type="text" inputmode="text" maxlength="7" pattern="#[0-9A-Fa-f]{6}" spellcheck="false" aria-describedby="settings-hint-${control.key}" />
                  </div>
                </fieldset>`,
            ).join('')}
          </div>
          <footer class="settings-actions">
            <p>Les réglages sont enregistrés localement, sans compte.</p>
            <button type="button" class="settings-reset" id="settings-reset">Réinitialiser bleu/violet</button>
          </footer>
        </form>
      </section>
    `;

    this.element.querySelector('#settings-close')?.addEventListener('click', this.onClose);
    this.element.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.onClose();
      }
    });
    this.element.querySelector('#settings-reset')?.addEventListener('click', () => {
      resetVisualPreferences();
      this.applyPreferences(getVisualPreferences());
    });

    for (const control of COLOR_CONTROLS) {
      const colorInput = this.element.querySelector<HTMLInputElement>(
        `#settings-color-${control.key}`,
      );
      const hexInput = this.element.querySelector<HTMLInputElement>(`#settings-hex-${control.key}`);
      colorInput?.addEventListener('input', () => {
        this.updateColor(control.key, colorInput.value);
      });
      hexInput?.addEventListener('input', () => {
        const value = hexInput.value.trim();
        if (isHexColor(value)) {
          this.updateColor(control.key, value);
        }
      });
      hexInput?.addEventListener('change', () => {
        const value = hexInput.value.trim();
        if (isHexColor(value)) {
          hexInput.value = value.toUpperCase();
        } else {
          hexInput.value = getVisualPreferences()[control.key];
        }
      });
    }
  }

  private updateColor(key: PreferenceKey, color: string): void {
    const value = color.toUpperCase();
    if (!isHexColor(value)) {
      return;
    }
    updateVisualPreferences({ [key]: value });
  }

  private applyPreferences(preferences: VisualPreferences): void {
    for (const control of COLOR_CONTROLS) {
      const color = preferences[control.key];
      const colorInput = this.element.querySelector<HTMLInputElement>(
        `#settings-color-${control.key}`,
      );
      const hexInput = this.element.querySelector<HTMLInputElement>(`#settings-hex-${control.key}`);
      const preview = this.element.querySelector<HTMLElement>(`[data-preview="${control.key}"] i`);
      if (colorInput !== null) {
        colorInput.value = color;
      }
      if (hexInput !== null && document.activeElement !== hexInput) {
        hexInput.value = color.toUpperCase();
      }
      if (preview !== null) {
        preview.style.setProperty('--preview-color', color);
      }
    }
  }
}
