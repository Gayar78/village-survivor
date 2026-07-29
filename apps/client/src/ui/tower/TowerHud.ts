import type { TowerGameState } from '@village-survivor/protocol';
import { TOWER_WEAPONS } from '@village-survivor/content';

import './tower-ui.css';

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
      player.activeWeaponId,
      ...player.weapons.flatMap((weapon) => [
        weapon.level,
        weapon.fireRate.toFixed(3),
        weapon.bulletDamage.toFixed(2),
      ]),
    ].join('|');
    if (signature === this.signature) {
      return;
    }
    this.signature = signature;

    const hpPercent = percentage(player.hp, player.maxHp);
    const xpPercent = percentage(player.experience, player.experienceToNext);

    this.element.innerHTML = `
      <div class="tower-hud" data-testid="tower-hud">
        <div class="tower-hud__head">
          <span class="tower-hud__sigil" aria-hidden="true">✦</span>
          <div><span class="tower-hud__eyebrow">Gardien de la clairière</span><strong>Survivant</strong></div>
        </div>
        <div class="tower-hud__body">
          <div class="tower-hud__vitality">
            <div class="tower-hud__bar-label"><span>Vitalité</span><strong>${Math.ceil(player.hp)} / ${player.maxHp}</strong></div>
            <div class="bar" data-testid="tower-hud-hp"><i style="width:${hpPercent}%"></i></div>
          </div>
          <div class="tower-hud-level" data-testid="tower-hud-level">
            <div class="tower-hud__bar-label"><span>Niveau ${player.level}</span><span>Essence</span></div>
            <div class="bar bar--xp"><i style="width:${xpPercent}%"></i></div>
          </div>
          <div class="tower-hud-arsenal" data-testid="tower-hud-weapon">
            ${TOWER_WEAPONS.map((definition, index) => {
              const weapon = player.weapons.find((candidate) => candidate.id === definition.id);
              const active = player.activeWeaponId === definition.id;
              return `<div class="tower-hud-weapon${active ? ' tower-hud-weapon--active' : ''}">
                <kbd>${index + 1}</kbd>
                <span>${definition.label}</span>
                <strong>Niv. ${weapon?.level ?? 1}</strong>
              </div>`;
            }).join('')}
          </div>
          <div class="tower-hud-resources" data-testid="tower-hud-resources">
            <div class="tower-hud-resource" data-testid="tower-hud-scrap">
              <span>Ferraille commune</span><strong>${state.scrapFund}</strong>
            </div>
            <div class="tower-hud-resource" data-testid="tower-hud-gold">
              <span>Or personnel</span><strong>${player.gold}</strong>
            </div>
          </div>
          <div class="tower-hud-wave" data-testid="tower-hud-wave"><span>Veille</span> Vague ${state.wave}</div>
        </div>
      </div>
    `;
  }
}
