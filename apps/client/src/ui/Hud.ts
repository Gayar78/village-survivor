import type { PublicGameState } from '@village-survivor/protocol';

function formatTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function percentage(value: number, maximum: number): number {
  return maximum <= 0 ? 0 : Math.max(0, Math.min(100, (value / maximum) * 100));
}

function phaseName(state: PublicGameState): string {
  if (state.phase === 'day') {
    return `Jour ${state.cycle}`;
  }
  if (state.phase === 'night') {
    return `Nuit ${state.cycle}`;
  }
  return 'Activation finale';
}

function cooldownLabel(remainingMs: number): string {
  return remainingMs <= 0 ? 'Prêt' : `${(remainingMs / 1_000).toFixed(1)} s`;
}

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character] ?? character);
}

export class Hud {
  private readonly element: HTMLElement;
  private readonly onUpgrade: (upgradeId: string) => void;
  private upgradeSignature = '';
  private terminalStatus: PublicGameState['status'] | undefined;
  private upgradePanelOpen = false;

  public constructor(element: HTMLElement, onUpgrade: (upgradeId: string) => void) {
    this.element = element;
    this.onUpgrade = onUpgrade;
  }

  /** Le panneau ne s'impose jamais : c'est le joueur qui l'ouvre quand il le peut. */
  public toggleUpgradePanel(): void {
    this.upgradePanelOpen = !this.upgradePanelOpen;
  }

  public isUpgradePanelOpen(): boolean {
    return this.upgradePanelOpen;
  }

  public render(state: PublicGameState): void {
    const upgradeSignature = state.upgradeChoices.map((choice) => choice.id).join('|');
    const isTerminal = state.status === 'victory' || state.status === 'defeat';
    if (state.upgradeChoices.length === 0) {
      this.upgradePanelOpen = false;
    }
    const showUpgradePanel =
      state.status === 'running' && this.upgradePanelOpen && state.upgradeChoices.length > 0;
    if (
      isTerminal &&
      state.status === this.terminalStatus &&
      this.element.querySelector('[data-testid="result-panel"]') !== null
    ) {
      return;
    }
    if (
      !isTerminal &&
      showUpgradePanel &&
      upgradeSignature === this.upgradeSignature &&
      this.element.querySelector('[data-testid="upgrade-panel"]') !== null
    ) {
      return;
    }
    this.upgradeSignature = upgradeSignature;
    this.terminalStatus = isTerminal ? state.status : undefined;
    // La défaite est présentée par `GameOverScreen` (écran plein écran dédié,
    // avec choix entre retour au menu et redémarrage immédiat) : ce panneau ne
    // gère donc plus que la victoire, pour éviter deux superpositions à la fois.
    const resultPanel =
      state.status === 'victory'
        ? `<section class="result result--${state.status}" data-testid="result-panel">
            <p class="eyebrow">MISSION ACCOMPLIE</p>
            <h1>Village sauvé</h1>
            <p>${escapeHtml(state.resultReason ?? '')}</p>
            <button type="button" id="restart-game">Recommencer</button>
          </section>`
        : '';
    const pending = state.player.pendingUpgrades;
    const upgradePanel = showUpgradePanel
      ? `<section class="upgrades" data-testid="upgrade-panel">
            <p class="eyebrow">NIVEAU ${state.player.level}${pending > 1 ? ` · ${pending} EN ATTENTE` : ''}</p>
            <h2>Choisissez une amélioration</h2>
            <p>Le monde continue pendant votre choix. <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> ou clic.</p>
            <div class="upgrade-grid">
              ${state.upgradeChoices
                .map(
                  (
                    upgrade,
                  ) => `<button type="button" class="upgrade-card" data-upgrade-id="${escapeHtml(upgrade.id)}">
                    <span>${upgrade.discipline === 'sword' ? 'ÉPÉE' : 'BARRIÈRE'}</span>
                    <strong>${escapeHtml(upgrade.name)}</strong>
                    <small>${escapeHtml(upgrade.description)}</small>
                  </button>`,
                )
                .join('')}
            </div>
          </section>`
      : '';
    // Le HUD est reconstruit à chaque publication : une animation CSS repartirait
    // de zéro à chaque frame. La pulsation est donc dérivée du temps simulé.
    const pulse = 0.55 + 0.45 * Math.sin(state.elapsedMs / 190);
    const pendingBanner =
      state.status === 'running' && pending > 0 && !showUpgradePanel
        ? `<button type="button" class="upgrade-pending" data-testid="upgrade-pending" style="--pulse:${pulse.toFixed(3)}">
            <strong>${pending} amélioration${pending > 1 ? 's' : ''} à choisir</strong>
            <span>Appuyez sur <kbd>F</kbd></span>
          </button>`
        : '';
    const playerHp = percentage(state.player.hp, state.player.maxHp);
    const villageHp = percentage(state.village.hp, state.village.maxHp);
    const experience = percentage(state.player.experience, state.player.experienceToNext);

    this.element.innerHTML = `
      <header class="topbar">
        <div class="brand"><span>VS</span><strong>Village Survivor</strong><small>M1 · ${escapeHtml(state.seed)}</small></div>
        <div class="phase phase--${state.phase}" data-testid="phase">
          <span>${phaseName(state)}</span><strong>${formatTime(state.phaseRemainingMs)}</strong>
        </div>
      </header>
      <aside class="village-info">
        <div class="bar bar--village"><i style="width:${villageHp}%"></i><span>${Math.ceil(state.village.hp)} / ${state.village.maxHp} PV</span></div>
      </aside>
      <div class="hud-bottom-grid" data-testid="hud-bottom-grid">
        <div class="hud-xp-vertical"><i style="height:${experience}%"></i></div>
        <div class="hud-stack">
          <div class="bar" data-testid="player-hp"><i style="width:${playerHp}%"></i><span>${Math.ceil(state.player.hp)} / ${state.player.maxHp} PV</span></div>
          <div class="bar bar--ward"><i style="width:${percentage(state.player.ward, state.player.maxWard)}%"></i><span>${Math.ceil(state.player.ward)} garde</span></div>
          <div class="hud-abilities">
            <div><kbd>Espace</kbd><span>Fente</span><strong>${cooldownLabel(state.player.sword.cooldownRemainingMs)}</strong></div>
            <div class="ability--barrier"><kbd>Q</kbd><span>Barrière</span><strong>${cooldownLabel(state.player.barrier.cooldownRemainingMs)}</strong></div>
            <div class="ability--heal"><kbd>E</kbd><span>Soin</span><strong>${state.player.heal.buffRemainingMs > 0 ? 'Actif' : cooldownLabel(state.player.heal.cooldownRemainingMs)}</strong></div>
          </div>
        </div>
      </div>
      ${pendingBanner}
      ${upgradePanel}
      ${resultPanel}
    `;

    for (const button of this.element.querySelectorAll<HTMLButtonElement>('[data-upgrade-id]')) {
      button.addEventListener('click', () => {
        const upgradeId = button.dataset.upgradeId;
        if (upgradeId !== undefined) {
          this.onUpgrade(upgradeId);
        }
      });
    }
    this.element
      .querySelector('[data-testid="upgrade-pending"]')
      ?.addEventListener('click', () => this.toggleUpgradePanel());
    this.element.querySelector('#restart-game')?.addEventListener('click', () => location.reload());
  }
}
