import './meta-build.css';

export type MetaBuildTab = 'characters' | 'blessings' | 'engineer';

export interface MetaCharacterBuild {
  id: string;
  name: string;
  title: string;
  summary: string;
  level: number;
  active: boolean;
}

export interface MetaBlessing {
  id: string;
  name: string;
  region: string;
  description: string;
  effect: string;
  cost: number;
  unlocked: boolean;
  available: boolean;
  isMaxed: boolean;
}

export interface MetaEngineerSkill {
  id: string;
  name: string;
  description: string;
  equipped: boolean;
  slot: number | null;
}

export interface MetaGem {
  id: string;
  name: string;
  effect: string;
  quantity: number;
  equippedSlot: number | null;
}

export interface MetaForgeRecipe {
  id: string;
  name: string;
  output: string;
  goldCost: number;
  available: boolean;
}

/** Données prêtes à afficher : le service de progression reste le propriétaire de leur persistance. */
export interface MetaBuildViewModel {
  accountGold: number | null;
  characters: readonly MetaCharacterBuild[];
  blessingBudget: { spent: number; total: number };
  blessings: readonly MetaBlessing[];
  skills: readonly MetaEngineerSkill[];
  gems: readonly MetaGem[];
  forgeRecipes: readonly MetaForgeRecipe[];
}

export interface MetaActionResult {
  viewModel?: MetaBuildViewModel;
  message?: string;
}

export interface MetaBuildController {
  load: () => Promise<MetaBuildViewModel>;
  activateCharacter?: (characterId: string) => Promise<MetaActionResult>;
  unlockBlessing?: (blessingId: string) => Promise<MetaActionResult>;
  equipSkill?: (skillId: string, slot: number) => Promise<MetaActionResult>;
  socketGem?: (gemId: string, slot: number) => Promise<MetaActionResult>;
  forge?: (recipeId: string) => Promise<MetaActionResult>;
}

export type MetaActionKind =
  'activateCharacter' | 'unlockBlessing' | 'equipSkill' | 'socketGem' | 'forge';

export interface MetaPendingAction {
  kind: MetaActionKind;
  id: string;
  slot?: number;
}

const tabs: ReadonlyArray<{ id: MetaBuildTab; label: string }> = [
  { id: 'characters', label: 'Personnages' },
  { id: 'blessings', label: 'Bénédictions' },
  { id: 'engineer', label: 'Atelier de l’Ingénieur' },
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatGold(value: number | null): string {
  return value === null
    ? 'Solde indisponible'
    : `${new Intl.NumberFormat('fr-FR').format(value)} or`;
}

export function canRequestMetaAction(
  controller: MetaBuildController,
  action: MetaActionKind,
  pending: MetaPendingAction | null,
): boolean {
  return controller[action] !== undefined && pending === null;
}

/**
 * Écran entièrement piloté par une vue de progression et un contrôleur étroit.
 * Les mutations ne sont reflétées qu'après la réponse du contrôleur persistant.
 */
export class MetaBuildScreen {
  private readonly element: HTMLElement;
  private readonly onClose: () => void;
  private readonly controller: MetaBuildController;
  private viewModel: MetaBuildViewModel | null = null;
  private tab: MetaBuildTab = 'characters';
  private pending: MetaPendingAction | null = null;
  private notice: { type: 'error' | 'success' | 'info'; text: string } | null = null;

  public constructor(element: HTMLElement, onClose: () => void, controller: MetaBuildController) {
    this.element = element;
    this.onClose = onClose;
    this.controller = controller;
    this.element.classList.add('meta-build');
  }

  public async open(): Promise<void> {
    this.show();
    this.viewModel = null;
    this.pending = null;
    this.notice = null;
    this.render();
    try {
      this.viewModel = await this.controller.load();
    } catch (error) {
      this.notice = { type: 'error', text: this.describeError(error) };
    }
    this.render();
    this.element.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus();
  }

  public show(): void {
    this.element.classList.remove('meta-build--hidden');
  }

  public hide(): void {
    this.element.classList.add('meta-build--hidden');
  }

  private render(): void {
    const model = this.viewModel;
    this.element.innerHTML = `
      <main class="meta-build__shell" aria-labelledby="meta-build-title">
        <header class="meta-build__header">
          <div>
            <p class="meta-build__kicker">Progression persistante</p>
            <h1 id="meta-build-title">Atelier de l’Ingénieur</h1>
            <p class="meta-build__intro">Préparez votre survivant avant la prochaine garde.</p>
          </div>
          <div class="meta-build__header-actions">
            <p class="meta-build__gold" aria-label="Or du compte"><span aria-hidden="true">✦</span> ${formatGold(model?.accountGold ?? null)}</p>
            <button class="meta-build__back" type="button" id="meta-build-back">Retour au menu</button>
          </div>
        </header>
        <div class="meta-build__tabs" role="tablist" aria-label="Atelier de progression">
          ${tabs
            .map(
              (tab) =>
                `<button type="button" role="tab" id="meta-tab-${tab.id}" aria-selected="${
                  this.tab === tab.id
                }" aria-controls="meta-panel-${tab.id}" data-tab="${tab.id}">${tab.label}</button>`,
            )
            .join('')}
        </div>
        ${this.notice ? `<p class="meta-build__notice meta-build__notice--${this.notice.type}" role="status">${escapeHtml(this.notice.text)}</p>` : ''}
        <section class="meta-build__content" role="tabpanel" id="meta-panel-${this.tab}" aria-labelledby="meta-tab-${this.tab}">
          ${model === null ? this.renderLoading() : this.renderTab(model)}
        </section>
      </main>`;
    this.attachListeners();
  }

  private renderLoading(): string {
    return `<div class="meta-build__loading" role="status"><span aria-hidden="true"></span> Préparation de l’atelier…</div>`;
  }

  private renderTab(model: MetaBuildViewModel): string {
    switch (this.tab) {
      case 'characters':
        return this.renderCharacters(model);
      case 'blessings':
        return this.renderBlessings(model);
      case 'engineer':
        return this.renderEngineer(model);
    }
  }

  private renderCharacters(model: MetaBuildViewModel): string {
    return `
      <div class="meta-build__panel-heading">
        <div><p class="meta-build__eyebrow">Profils sauvegardés</p><h2>Choisissez votre survivant</h2></div>
        <p>Un seul profil est actif en partie.</p>
      </div>
      <div class="meta-build__character-grid">
        ${model.characters
          .slice(0, 3)
          .map((character) => {
            const active = character.active;
            const isPending =
              this.pending?.kind === 'activateCharacter' && this.pending.id === character.id;
            const allowed =
              canRequestMetaAction(this.controller, 'activateCharacter', this.pending) && !active;
            return `<article class="meta-character ${active ? 'meta-character--active' : ''}">
            <div class="meta-character__seal" aria-hidden="true">${escapeHtml(character.name.charAt(0).toUpperCase())}</div>
            <p class="meta-build__eyebrow">${escapeHtml(character.title)}</p>
            <h3>${escapeHtml(character.name)}</h3><p>${escapeHtml(character.summary)}</p>
            <div class="meta-character__footer"><span>Niveau ${character.level}</span>
              ${active ? '<strong>Actif</strong>' : `<button type="button" data-action="activateCharacter" data-id="${escapeHtml(character.id)}" ${allowed ? '' : 'disabled'}>${isPending ? 'Activation…' : 'Activer'}</button>`}
            </div>
          </article>`;
          })
          .join('')}
      </div>`;
  }

  private renderBlessings(model: MetaBuildViewModel): string {
    const percentage =
      model.blessingBudget.total > 0
        ? Math.min(100, (model.blessingBudget.spent / model.blessingBudget.total) * 100)
        : 0;
    return `
      <div class="meta-build__panel-heading meta-build__panel-heading--split">
        <div><p class="meta-build__eyebrow">Carte astrale</p><h2>Bénédictions du village</h2></div>
        <div class="meta-build__budget"><span>Éclats investis</span><strong>${model.blessingBudget.spent} / ${model.blessingBudget.total}</strong><i style="--meta-budget:${percentage}%"></i></div>
      </div>
      <p class="meta-build__preview">Aperçu actuel : les effets débloqués seront appliqués au début de la prochaine garde.</p>
      <div class="meta-build__blessing-tree">
        ${model.blessings
          .map((blessing) => {
            const isPending =
              this.pending?.kind === 'unlockBlessing' && this.pending.id === blessing.id;
            const allowed =
              canRequestMetaAction(this.controller, 'unlockBlessing', this.pending) &&
              blessing.available;
            return `<article class="meta-blessing ${blessing.unlocked ? 'meta-blessing--unlocked' : ''} ${!blessing.available ? 'meta-blessing--locked' : ''}">
            <span class="meta-blessing__region">${escapeHtml(blessing.region)}</span><h3>${escapeHtml(blessing.name)}</h3>
            <p>${escapeHtml(blessing.description)}</p><strong>${escapeHtml(blessing.effect)}</strong>
            <button type="button" data-action="unlockBlessing" data-id="${escapeHtml(blessing.id)}" ${allowed ? '' : 'disabled'}>${blessing.isMaxed ? 'Rang maximal' : isPending ? 'Validation…' : `${blessing.cost} or`}</button>
          </article>`;
          })
          .join('')}
      </div>`;
  }

  private renderEngineer(model: MetaBuildViewModel): string {
    const skills = [0, 1, 2].map((slot) => model.skills.find((skill) => skill.slot === slot));
    const gems = [0, 1, 2].map((slot) => model.gems.find((gem) => gem.equippedSlot === slot));
    return `
      <div class="meta-build__panel-heading"><div><p class="meta-build__eyebrow">Équipement de terrain</p><h2>Forge et modules</h2></div><p>Les choix sont confirmés par l’atelier avant d’être équipés.</p></div>
      <div class="meta-engineer__layout">
        <section class="meta-engineer__section"><h3>Compétences équipées</h3><div class="meta-slots">
          ${skills.map((skill, slot) => `<div class="meta-slot"><span>Emplacement ${slot + 1}</span><strong>${skill ? escapeHtml(skill.name) : 'Vide'}</strong><small>${skill ? escapeHtml(skill.description) : 'Choisissez une compétence ci-dessous.'}</small></div>`).join('')}
        </div><div class="meta-inventory">${
          model.skills
            .filter((skill) => !skill.equipped)
            .map((skill) => this.renderSkill(skill))
            .join('') || '<p>Aucune autre compétence disponible.</p>'
        }</div></section>
        <section class="meta-engineer__section"><h3>Gemmes d’augmentation</h3><div class="meta-slots">
          ${gems.map((gem, slot) => `<div class="meta-slot meta-slot--gem"><span>Châsse ${slot + 1}</span><strong>${gem ? escapeHtml(gem.name) : 'Vide'}</strong><small>${gem ? escapeHtml(gem.effect) : 'Une gemme peut être sertie ici.'}</small></div>`).join('')}
        </div><div class="meta-inventory">${
          model.gems
            .filter((gem) => gem.equippedSlot === null && gem.quantity > 0)
            .map((gem) => this.renderGem(gem))
            .join('') || '<p>Aucune gemme non sertie.</p>'
        }</div></section>
      </div>
      <section class="meta-forge"><div><p class="meta-build__eyebrow">Recettes disponibles</p><h3>Forge de l’Ingénieur</h3></div><div class="meta-forge__recipes">${model.forgeRecipes.map((recipe) => this.renderRecipe(recipe, model.accountGold)).join('')}</div></section>`;
  }

  private renderSkill(skill: MetaEngineerSkill): string {
    const slot = this.firstEmptySkillSlot();
    const isPending = this.pending?.kind === 'equipSkill' && this.pending.id === skill.id;
    const allowed =
      slot !== null && canRequestMetaAction(this.controller, 'equipSkill', this.pending);
    return `<div class="meta-inventory__item"><div><strong>${escapeHtml(skill.name)}</strong><span>${escapeHtml(skill.description)}</span></div><button type="button" data-action="equipSkill" data-id="${escapeHtml(skill.id)}" data-slot="${slot ?? ''}" ${allowed ? '' : 'disabled'}>${isPending ? 'Équipement…' : 'Équiper'}</button></div>`;
  }

  private renderGem(gem: MetaGem): string {
    const slot = this.firstEmptyGemSlot();
    const isPending = this.pending?.kind === 'socketGem' && this.pending.id === gem.id;
    const allowed =
      slot !== null && canRequestMetaAction(this.controller, 'socketGem', this.pending);
    return `<div class="meta-inventory__item"><div><strong>${escapeHtml(gem.name)} <em>×${gem.quantity}</em></strong><span>${escapeHtml(gem.effect)}</span></div><button type="button" data-action="socketGem" data-id="${escapeHtml(gem.id)}" data-slot="${slot ?? ''}" ${allowed ? '' : 'disabled'}>${isPending ? 'Sertissage…' : 'Sertir'}</button></div>`;
  }

  private renderRecipe(recipe: MetaForgeRecipe, gold: number | null): string {
    const isPending = this.pending?.kind === 'forge' && this.pending.id === recipe.id;
    const enoughGold = gold !== null && gold >= recipe.goldCost;
    const allowed =
      recipe.available &&
      enoughGold &&
      canRequestMetaAction(this.controller, 'forge', this.pending);
    return `<article class="meta-recipe"><div><strong>${escapeHtml(recipe.name)}</strong><span>${escapeHtml(recipe.output)}</span></div><button type="button" data-action="forge" data-id="${escapeHtml(recipe.id)}" ${allowed ? '' : 'disabled'}>${isPending ? 'Forge…' : `${recipe.goldCost} or`}</button></article>`;
  }

  private firstEmptySkillSlot(): number | null {
    if (!this.viewModel) return null;
    return (
      [0, 1, 2].find((slot) => !this.viewModel?.skills.some((skill) => skill.slot === slot)) ?? null
    );
  }

  private firstEmptyGemSlot(): number | null {
    if (!this.viewModel) return null;
    return (
      [0, 1, 2].find((slot) => !this.viewModel?.gems.some((gem) => gem.equippedSlot === slot)) ??
      null
    );
  }

  private attachListeners(): void {
    this.element.querySelector('#meta-build-back')?.addEventListener('click', this.onClose);
    this.element.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) =>
      button.addEventListener('click', () => {
        this.tab = button.dataset.tab as MetaBuildTab;
        this.notice = null;
        this.render();
      }),
    );
    this.element.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) =>
      button.addEventListener('click', () => {
        const kind = button.dataset.action as MetaActionKind;
        const id = button.dataset.id;
        if (id) void this.handleAction(kind, id, button.dataset.slot);
      }),
    );
  }

  private async handleAction(
    kind: MetaActionKind,
    id: string,
    rawSlot: string | undefined,
  ): Promise<void> {
    if (!canRequestMetaAction(this.controller, kind, this.pending)) {
      this.notice = { type: 'info', text: 'La connexion à l’atelier n’est pas encore disponible.' };
      this.render();
      return;
    }
    const slot = rawSlot === undefined || rawSlot === '' ? undefined : Number(rawSlot);
    this.pending = slot === undefined ? { kind, id } : { kind, id, slot };
    this.notice = { type: 'info', text: 'Validation de l’atelier en cours…' };
    this.render();
    try {
      let result: MetaActionResult;
      switch (kind) {
        case 'activateCharacter':
          result = await this.controller.activateCharacter!(id);
          break;
        case 'unlockBlessing':
          result = await this.controller.unlockBlessing!(id);
          break;
        case 'equipSkill':
          if (slot === undefined) throw new Error('Choisissez un emplacement de compétence.');
          result = await this.controller.equipSkill!(id, slot);
          break;
        case 'socketGem':
          if (slot === undefined) throw new Error('Choisissez une châsse pour cette gemme.');
          result = await this.controller.socketGem!(id, slot);
          break;
        case 'forge':
          result = await this.controller.forge!(id);
          break;
      }
      if (result.viewModel) this.viewModel = result.viewModel;
      this.notice = {
        type: 'success',
        text: result.message ?? 'Modification confirmée par l’atelier.',
      };
    } catch (error) {
      this.notice = { type: 'error', text: this.describeError(error) };
    } finally {
      this.pending = null;
      this.render();
    }
  }

  private describeError(error: unknown): string {
    return error instanceof Error && error.message
      ? error.message
      : 'L’atelier ne peut pas confirmer cette action. Réessayez.';
  }
}
