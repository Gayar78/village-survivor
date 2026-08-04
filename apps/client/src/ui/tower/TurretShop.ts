import type { TowerGameState, TurretDir } from '@village-survivor/protocol';
import {
  TOWER_GLOBAL_DEFENSE_OFFERS,
  TOWER_GLOBAL_DEFENSE_ROTATIONS,
  TOWER_TURRET_MODULES,
  TOWER_TURRET_REPAIR_COST_PER_HP,
  TOWER_TURRET_SHOP,
  TOWER_TURRET_SUPER_MODULES,
  TOWER_TURRET_TARGET_PRIORITIES,
} from '@village-survivor/content';

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;',
};

type DefenseShopEntry = Readonly<{
  id: string;
  label: string;
  desc: string;
  cost: number;
}>;

type GlobalDefenseEntry = DefenseShopEntry & Readonly<{ maxLevel: number }>;

type MerchantModuleEntry = (typeof TOWER_TURRET_SUPER_MODULES)[number];

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character] ?? character);
}

/**
 * Atelier de défense ouvert uniquement à portée d’une tourelle. Toutes les actions
 * restent de simples chaînes passées au callback : le client ne modifie jamais l’état
 * local et la session garde donc son chemin d'action serveur idempotent habituel.
 */
export class TurretShop {
  private readonly element: HTMLElement;
  private readonly onAction: (turret: TurretDir, action: string) => void;
  private opened = false;
  private signature = '';
  private actionPending = false;
  private currentTurret: TurretDir | undefined;

  public constructor(root: HTMLElement, onAction: (turret: TurretDir, action: string) => void) {
    this.element = root;
    this.onAction = onAction;
    this.element.addEventListener('pointerdown', this.handleAction);
    this.element.addEventListener('click', this.handleAction);
  }

  public open(): void {
    this.opened = true;
  }

  public close(): void {
    this.opened = false;
    this.actionPending = false;
  }

  public toggle(): void {
    this.opened = !this.opened;
  }

  public isOpen(): boolean {
    return this.opened;
  }

  private clear(): void {
    if (this.signature !== '') {
      this.signature = '';
      this.element.innerHTML = '';
    }
  }

  public render(state: TowerGameState): void {
    const nearTurret = state.player.nearTurret;
    if (nearTurret === undefined) {
      this.opened = false;
      this.actionPending = false;
      this.currentTurret = undefined;
      this.clear();
      return;
    }
    if (!this.opened) {
      this.actionPending = false;
      this.clear();
      return;
    }

    const turret = state.turrets.find((candidate) => candidate.dir === nearTurret);
    if (turret === undefined) {
      this.actionPending = false;
      this.currentTurret = undefined;
      this.clear();
      return;
    }

    const repairMissing = Math.max(0, turret.maxHp - turret.hp);
    const repairCost = Math.ceil(repairMissing * TOWER_TURRET_REPAIR_COST_PER_HP);
    const modules = turret.modules;
    const activeOffers = this.getActiveGlobalOffers(state);
    const rotation = state.globalDefenseShop.rotationId;
    const merchantOffers = this.getActiveMerchantOffers(state);
    const merchantRotation = state.merchantShop.rotationId;
    const signature = JSON.stringify({
      turret: nearTurret,
      scrap: state.scrapFund,
      hp: [Math.ceil(turret.hp), turret.maxHp],
      energy: [Math.ceil(turret.energy), turret.maxEnergy],
      range: turret.range,
      modules,
      priority: turret.targetPriority,
      offers: activeOffers,
      upgrades: state.globalDefenseUpgrades,
      rotation,
      merchantOffers: state.merchantShop.offerIds,
      merchantRotation,
    });
    if (this.currentTurret !== nearTurret) {
      this.currentTurret = nearTurret;
      this.actionPending = false;
    }
    if (signature === this.signature) {
      return;
    }
    this.signature = signature;
    this.actionPending = false;

    const moduleButtons = TOWER_TURRET_MODULES.map((entry) => {
      const installed = modules.includes(entry.id);
      const disabled = installed || state.scrapFund < entry.cost;
      return this.renderActionCard(
        entry,
        `module:${entry.id}`,
        disabled,
        installed ? 'Installé' : undefined,
      );
    });
    const merchantButtons = merchantOffers
      .map((entry) => {
        const installed = modules.includes(entry.id);
        const disabled = installed || state.scrapFund < entry.cost;
        return this.renderActionCard(
          entry,
          `module:${entry.id}`,
          disabled,
          installed ? 'Installé' : undefined,
        );
      })
      .join('');
    const priority = turret.targetPriority;
    const priorityButtons = TOWER_TURRET_TARGET_PRIORITIES.map((entry) => {
      const active = priority === entry.id;
      return `<button type="button" class="turret-priority${active ? ' turret-priority--active' : ''}" data-action="priority:${entry.id}" aria-pressed="${active}" ${active ? 'disabled' : ''}>
        <strong>${entry.label}</strong><small>${entry.desc}</small>
      </button>`;
    }).join('');
    const globalOffers = activeOffers
      .map((offer) => {
        const level = this.globalOfferLevel(state, offer.id);
        const purchased = level >= offer.maxLevel;
        const disabled = purchased || state.scrapFund < offer.cost;
        return this.renderActionCard(
          offer,
          `global:${offer.id}`,
          disabled,
          purchased ? 'Niveau maximum' : `Niv. ${level} / ${offer.maxLevel}`,
        );
      })
      .join('');
    const legacyButtons = TOWER_TURRET_SHOP.map((entry) =>
      this.renderActionCard(entry, entry.id, state.scrapFund < entry.cost),
    ).join('');
    const repairDisabled = repairMissing <= 0 || state.scrapFund < repairCost;
    const installedModules = modules.length === 0 ? 'Aucun module installé' : modules.join(' · ');

    this.element.innerHTML = `
      <section class="turret-shop" data-testid="turret-shop" aria-labelledby="turret-shop-title">
        <p class="eyebrow">TOURELLE ${escapeHtml(nearTurret)}</p>
        <div class="turret-shop__title-row"><h2 id="turret-shop-title">Arsenal de défense</h2><span>E · fermer</span></div>
        <div class="turret-shop__status" aria-label="État de la tourelle">
          <span>PV <strong>${Math.ceil(turret.hp)} / ${turret.maxHp}</strong></span>
          <span>Énergie <strong>${Math.ceil(turret.energy)} / ${turret.maxEnergy}</strong></span>
          <span>Portée <strong>${Math.round(turret.range)}</strong></span>
        </div>
        <p>Ferraille commune disponible : <strong>${state.scrapFund}</strong></p>

        <section class="turret-shop__section" aria-labelledby="turret-modules-title">
          <div class="turret-shop__section-heading"><h3 id="turret-modules-title">Modules</h3><span>${escapeHtml(installedModules)}</span></div>
          <div class="turret-shop-grid turret-shop-grid--modules">${moduleButtons.join('')}</div>
        </section>

        <section class="turret-shop__section turret-shop__section--merchant" data-testid="turret-merchant-offers" aria-labelledby="turret-merchant-title">
          <div class="turret-shop__section-heading"><h3 id="turret-merchant-title">Marchand itinérant</h3><span>Rotation ${merchantRotation + 1}</span></div>
          <p class="turret-shop__section-copy">Super-modules rares disponibles pour cette rotation uniquement.</p>
          <div class="turret-shop-grid turret-shop-grid--merchant">${merchantButtons}</div>
        </section>

        <section class="turret-shop__section" aria-labelledby="turret-targeting-title">
          <div class="turret-shop__section-heading"><h3 id="turret-targeting-title">Ciblage</h3><span>Priorité active : ${escapeHtml(this.priorityLabel(priority))}</span></div>
          <div class="turret-priorities" role="group" aria-label="Priorité de ciblage">${priorityButtons}</div>
        </section>

        <section class="turret-shop__section turret-shop__section--network" aria-labelledby="turret-network-title">
          <div class="turret-shop__section-heading"><h3 id="turret-network-title">Réseau de défense</h3><span>Vague ${state.wave} · rotation ${rotation + 1} / ${TOWER_GLOBAL_DEFENSE_ROTATIONS.length}</span></div>
          <p class="turret-shop__section-copy">Offres communes tournantes · dépense partagée</p>
          <div class="turret-shop-grid turret-shop-grid--network">${globalOffers}</div>
        </section>

        <section class="turret-shop__section turret-shop__section--legacy" aria-labelledby="turret-maintenance-title">
          <div class="turret-shop__section-heading"><h3 id="turret-maintenance-title">Entretien & améliorations</h3></div>
          <div class="turret-shop-grid">
            <button type="button" class="turret-shop-item turret-shop-item--repair" data-action="repair" ${repairDisabled ? 'disabled' : ''}>
              <strong>Réparer</strong>
              <small>${Math.ceil(turret.hp)} / ${turret.maxHp} PV</small>
              <span>${repairCost} ferraille</span>
            </button>
            ${legacyButtons}
          </div>
        </section>
      </section>
    `;
  }

  private getActiveGlobalOffers(state: TowerGameState): readonly GlobalDefenseEntry[] {
    const catalog = TOWER_GLOBAL_DEFENSE_OFFERS;
    const activeOffers: GlobalDefenseEntry[] = [];
    for (const id of state.globalDefenseShop.offerIds) {
      const offer = catalog.find((entry) => entry.id === id);
      if (offer !== undefined) {
        activeOffers.push(offer);
      }
    }
    return activeOffers;
  }

  private getActiveMerchantOffers(state: TowerGameState): readonly MerchantModuleEntry[] {
    const activeOffers: MerchantModuleEntry[] = [];
    for (const id of state.merchantShop.offerIds) {
      const offer = TOWER_TURRET_SUPER_MODULES.find((entry) => entry.id === id);
      if (offer !== undefined) {
        activeOffers.push(offer);
      }
    }
    return activeOffers;
  }

  private globalOfferLevel(state: TowerGameState, id: string): number {
    return state.globalDefenseUpgrades.find((upgrade) => upgrade.id === id)?.level ?? 0;
  }

  private priorityLabel(priority: string): string {
    return TOWER_TURRET_TARGET_PRIORITIES.find((entry) => entry.id === priority)?.label ?? priority;
  }

  private renderActionCard(
    entry: DefenseShopEntry,
    action: string,
    disabled: boolean,
    status?: string,
  ): string {
    return `<button type="button" class="turret-shop-item" data-action="${escapeHtml(action)}" ${disabled ? 'disabled' : ''}>
      <strong>${escapeHtml(entry.label)}</strong>
      <small>${escapeHtml(entry.desc)}</small>
      <span>${entry.cost} ferraille${status === undefined ? '' : ` · ${escapeHtml(status)}`}</span>
    </button>`;
  }

  private readonly handleAction = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>('[data-action]');
    const action = button?.dataset.action;
    if (
      button === null ||
      button === undefined ||
      button.disabled ||
      action === undefined ||
      this.currentTurret === undefined ||
      this.actionPending
    ) {
      return;
    }

    this.actionPending = true;
    for (const choice of this.element.querySelectorAll<HTMLButtonElement>('[data-action]')) {
      choice.disabled = true;
    }
    this.onAction(this.currentTurret, action);
  };
}
