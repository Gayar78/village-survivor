import type { TowerGameState } from '@village-survivor/protocol';

function percentage(value: number, maximum: number): number {
  return maximum <= 0 ? 0 : Math.max(0, Math.min(100, (value / maximum) * 100));
}

/**
 * HUD du nouveau jeu (Tower) : PV joueur, niveau + XP, Ferraille COMMUNE (fonds de
 * défense partagé), Or PERSONNEL et n° de vague. Lecture seule (aucun callback) :
 * ce composant ne fait que projeter `TowerGameState` en DOM. Comme `Hud.ts`, une
 * signature dérivée de l'état évite de réécrire le DOM quand rien n'a changé.
 */
export class TowerHud {
  private readonly element: HTMLElement;
  private signature = '';

  public constructor(root: HTMLElement) {
    this.element = root;
  }

  public render(state: TowerGameState): void {
    const player = state.player;
    const signature = [
      Math.ceil(player.hp),
      player.maxHp,
      player.level,
      Math.floor(player.experience),
      player.experienceToNext,
      state.scrapFund,
      player.gold,
      state.wave,
    ].join('|');
    if (signature === this.signature) {
      return;
    }
    this.signature = signature;

    const hpPercent = percentage(player.hp, player.maxHp);
    const xpPercent = percentage(player.experience, player.experienceToNext);

    this.element.innerHTML = `
      <div class="tower-hud" data-testid="tower-hud">
        <div class="bar" data-testid="tower-hud-hp">
          <i style="width:${hpPercent}%"></i>
          <span>${Math.ceil(player.hp)} / ${player.maxHp} PV</span>
        </div>
        <div class="tower-hud-level" data-testid="tower-hud-level">
          <span>Niveau ${player.level}</span>
          <div class="bar bar--xp"><i style="width:${xpPercent}%"></i></div>
        </div>
        <div class="tower-hud-resources" data-testid="tower-hud-resources">
          <div class="tower-hud-resource" data-testid="tower-hud-scrap">
            <span>Ferraille</span><strong>${state.scrapFund}</strong>
          </div>
          <div class="tower-hud-resource" data-testid="tower-hud-gold">
            <span>Or</span><strong>${player.gold}</strong>
          </div>
        </div>
        <div class="tower-hud-wave" data-testid="tower-hud-wave">Vague ${state.wave}</div>
      </div>
    `;
  }
}
