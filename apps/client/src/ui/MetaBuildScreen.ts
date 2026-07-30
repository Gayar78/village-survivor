import './meta-build.css';

export type MetaBuildTab = 'characters' | 'blessings' | 'engineer';

export interface MetaCharacterBuild {
  id: string;
  name: string;
  title: string;
  summary: string;
  level: number;
  active: boolean;
  isDefault: boolean;
}

export interface MetaBlessingPath {
  id: string;
  name: string;
  description: string;
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
  rank: number;
  maxRank: number;
  cost: number | null;
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
  profileLimit: number;
  blessingPaths: readonly MetaBlessingPath[];
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
  createCharacter?: (name: string, blessingPathId: string) => Promise<MetaActionResult>;
  activateCharacter?: (characterId: string) => Promise<MetaActionResult>;
  deleteCharacter?: (characterId: string) => Promise<MetaActionResult>;
  unlockBlessing?: (blessingId: string) => Promise<MetaActionResult>;
  purchaseSkill?: (skillId: string) => Promise<MetaActionResult>;
  equipSkill?: (skillId: string, slot: number) => Promise<MetaActionResult>;
  unequipSkill?: (slot: number) => Promise<MetaActionResult>;
  socketGem?: (gemId: string, slot: number) => Promise<MetaActionResult>;
  unsocketGem?: (slot: number) => Promise<MetaActionResult>;
  forge?: (recipeId: string) => Promise<MetaActionResult>;
}

export type MetaActionKind =
  | 'createCharacter'
  | 'activateCharacter'
  | 'deleteCharacter'
  | 'unlockBlessing'
  | 'purchaseSkill'
  | 'equipSkill'
  | 'unequipSkill'
  | 'socketGem'
  | 'unsocketGem'
  | 'forge';

export interface MetaPendingAction {
  kind: MetaActionKind;
  id: string;
  slot?: number;
}

export function canDeleteProfile(character: Pick<MetaCharacterBuild, 'isDefault'>): boolean {
  return !character.isDefault;
}

export function defaultReplacementSlot(
  occupiedSlots: readonly number[],
  slotCount = 3,
): number | null {
  if (slotCount < 1) return null;
  return (
    Array.from({ length: slotCount }, (_, slot) => slot).find(
      (slot) => !occupiedSlots.includes(slot),
    ) ?? 0
  );
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
  private deleteConfirmationId: string | null = null;
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
    this.deleteConfirmationId = null;
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
    const canCreate =
      model.characters.length < model.profileLimit &&
      canRequestMetaAction(this.controller, 'createCharacter', this.pending);
    const createPending = this.pending?.kind === 'createCharacter';
    const defaultName = `Survivant ${Math.min(model.characters.length + 1, model.profileLimit)}`;
    return `
      <div class="meta-build__panel-heading">
        <div><p class="meta-build__eyebrow">Profils sauvegardés</p><h2>Choisissez votre survivant</h2></div>
        <p>${model.characters.length} / ${model.profileLimit} profils · un seul profil est actif en partie.</p>
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
            const deleteAllowed =
              canDeleteProfile(character) &&
              canRequestMetaAction(this.controller, 'deleteCharacter', this.pending);
            const asksForDelete = this.deleteConfirmationId === character.id;
            const deletePending =
              this.pending?.kind === 'deleteCharacter' && this.pending.id === character.id;
            return `<article class="meta-character ${active ? 'meta-character--active' : ''}">
            <div class="meta-character__seal" aria-hidden="true">${escapeHtml(character.name.charAt(0).toUpperCase())}</div>
            <p class="meta-build__eyebrow">${escapeHtml(character.title)}${character.isDefault ? ' · Profil par défaut' : ''}</p>
            <h3>${escapeHtml(character.name)}</h3><p>${escapeHtml(character.summary)}</p>
            <div class="meta-character__footer"><span>Niveau ${character.level}</span>
              ${active ? '<strong aria-label="Profil actif">Actif</strong>' : `<button type="button" data-action="activateCharacter" data-id="${escapeHtml(character.id)}" ${allowed ? '' : 'disabled'}>${isPending ? 'Activation…' : 'Activer'}</button>`}
            </div>
            ${
              character.isDefault
                ? '<small>Le profil par défaut ne peut pas être supprimé.</small>'
                : asksForDelete
                  ? `<div class="meta-character__confirm" role="group" aria-label="Confirmer la suppression de ${escapeHtml(character.name)}"><span>Supprimer définitivement ce profil ?</span><button type="button" data-action="deleteCharacter" data-id="${escapeHtml(character.id)}" ${deleteAllowed ? '' : 'disabled'}>${deletePending ? 'Suppression…' : 'Confirmer'}</button><button type="button" data-cancel-delete>Annuler</button></div>`
                  : `<button type="button" data-request-delete="${escapeHtml(character.id)}" ${deleteAllowed ? '' : 'disabled'}>Supprimer</button>`
            }
          </article>`;
          })
          .join('')}
        ${
          model.characters.length < model.profileLimit
            ? `<form class="meta-character meta-character--create" id="meta-create-character"><p class="meta-build__eyebrow">Nouveau profil</p><h3>Créer un survivant</h3><label>Nom<input type="text" name="name" value="${escapeHtml(defaultName)}" minlength="1" maxlength="32" required ${canCreate ? '' : 'disabled'}></label><label>Voie de bénédiction<select name="blessingPathId" required ${canCreate ? '' : 'disabled'}>${model.blessingPaths.map((path) => `<option value="${escapeHtml(path.id)}">${escapeHtml(path.name)} — ${escapeHtml(path.description)}</option>`).join('')}</select></label><button type="submit" ${canCreate ? '' : 'disabled'}>${createPending ? 'Création…' : 'Créer le profil'}</button></form>`
            : ''
        }
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
          ${skills
            .map(
              (skill, slot) =>
                `<div class="meta-slot"><span>Emplacement ${slot + 1}</span><strong>${skill ? escapeHtml(skill.name) : 'Vide'}</strong><small>${skill ? escapeHtml(skill.description) : 'Choisissez une compétence ci-dessous.'}</small>${skill ? `<button type="button" data-action="unequipSkill" data-id="${slot}" ${canRequestMetaAction(this.controller, 'unequipSkill', this.pending) ? '' : 'disabled'}>${this.pending?.kind === 'unequipSkill' && this.pending.id === String(slot) ? 'Retrait…' : 'Retirer'}</button>` : ''}</div>`,
            )
            .join('')}
        </div><div class="meta-inventory">${model.skills.map((skill) => this.renderSkill(skill, model.accountGold)).join('')}</div></section>
        <section class="meta-engineer__section"><h3>Gemmes d’augmentation</h3><div class="meta-slots">
          ${gems
            .map(
              (gem, slot) =>
                `<div class="meta-slot meta-slot--gem"><span>Châsse ${slot + 1}</span><strong>${gem ? escapeHtml(gem.name) : 'Vide'}</strong><small>${gem ? escapeHtml(gem.effect) : 'Une gemme peut être sertie ici.'}</small>${gem ? `<button type="button" data-action="unsocketGem" data-id="${slot}" ${canRequestMetaAction(this.controller, 'unsocketGem', this.pending) ? '' : 'disabled'}>${this.pending?.kind === 'unsocketGem' && this.pending.id === String(slot) ? 'Retrait…' : 'Retirer'}</button>` : ''}</div>`,
            )
            .join('')}
        </div><div class="meta-inventory">${
          model.gems
            .filter((gem) => gem.equippedSlot === null && gem.quantity > 0)
            .map((gem) => this.renderGem(gem))
            .join('') || '<p>Aucune gemme non sertie.</p>'
        }</div></section>
      </div>
      <section class="meta-forge"><div><p class="meta-build__eyebrow">Recettes disponibles</p><h3>Forge de l’Ingénieur</h3></div><div class="meta-forge__recipes">${model.forgeRecipes.map((recipe) => this.renderRecipe(recipe, model.accountGold)).join('')}</div></section>`;
  }

  private renderSkill(skill: MetaEngineerSkill, gold: number | null): string {
    const defaultSlot = defaultReplacementSlot(
      this.viewModel?.skills.flatMap((candidate) =>
        candidate.slot === null ? [] : [candidate.slot],
      ) ?? [],
    );
    const isPending = this.pending?.kind === 'equipSkill' && this.pending.id === skill.id;
    const purchasePending = this.pending?.kind === 'purchaseSkill' && this.pending.id === skill.id;
    const enoughGold = skill.cost !== null && gold !== null && gold >= skill.cost;
    const canPurchase =
      skill.rank < skill.maxRank &&
      enoughGold &&
      canRequestMetaAction(this.controller, 'purchaseSkill', this.pending);
    const canEquip =
      skill.rank > 0 &&
      !skill.equipped &&
      defaultSlot !== null &&
      canRequestMetaAction(this.controller, 'equipSkill', this.pending);
    return `<article class="meta-inventory__item"><div><strong>${escapeHtml(skill.name)}</strong><span>${escapeHtml(skill.description)}</span><span>Rang ${skill.rank} / ${skill.maxRank}</span></div><div class="meta-inventory__actions"><button type="button" data-action="purchaseSkill" data-id="${escapeHtml(skill.id)}" ${canPurchase ? '' : 'disabled'}>${skill.rank >= skill.maxRank ? 'Rang maximal' : purchasePending ? 'Achat…' : `${skill.rank === 0 ? 'Acheter' : 'Améliorer'} · ${skill.cost ?? 0} or`}</button>${
      skill.equipped
        ? `<span>Équipée · emplacement ${(skill.slot ?? 0) + 1}</span>`
        : skill.rank > 0
          ? `<form data-equipment-form="equipSkill" data-id="${escapeHtml(skill.id)}"><label>Emplacement<span class="meta-build__sr-only"> pour ${escapeHtml(skill.name)}</span><select name="slot">${this.renderSlotOptions(defaultSlot, 'Emplacement')}</select></label><button type="submit" ${canEquip ? '' : 'disabled'}>${isPending ? 'Équipement…' : 'Équiper / remplacer'}</button></form>`
          : '<span>Achetez cette compétence pour l’équiper.</span>'
    }</div></article>`;
  }

  private renderGem(gem: MetaGem): string {
    const slot = defaultReplacementSlot(
      this.viewModel?.gems.flatMap((candidate) =>
        candidate.equippedSlot === null ? [] : [candidate.equippedSlot],
      ) ?? [],
    );
    const isPending = this.pending?.kind === 'socketGem' && this.pending.id === gem.id;
    const allowed =
      slot !== null && canRequestMetaAction(this.controller, 'socketGem', this.pending);
    return `<div class="meta-inventory__item"><div><strong>${escapeHtml(gem.name)} <em>×${gem.quantity}</em></strong><span>${escapeHtml(gem.effect)}</span></div><form data-equipment-form="socketGem" data-id="${escapeHtml(gem.id)}"><label>Châsse<span class="meta-build__sr-only"> pour ${escapeHtml(gem.name)}</span><select name="slot">${this.renderSlotOptions(slot, 'Châsse')}</select></label><button type="submit" ${allowed ? '' : 'disabled'}>${isPending ? 'Sertissage…' : 'Sertir / remplacer'}</button></form></div>`;
  }

  private renderSlotOptions(selectedSlot: number | null, label: string): string {
    return [0, 1, 2]
      .map(
        (slot) =>
          `<option value="${slot}" ${slot === selectedSlot ? 'selected' : ''}>${label} ${slot + 1}</option>`,
      )
      .join('');
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
    this.element
      .querySelector<HTMLFormElement>('#meta-create-character')
      ?.addEventListener('submit', (event) => {
        event.preventDefault();
        void this.handleCreateCharacter(event.currentTarget as HTMLFormElement);
      });
    this.element.querySelectorAll<HTMLFormElement>('[data-equipment-form]').forEach((form) =>
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const kind = form.dataset.equipmentForm as 'equipSkill' | 'socketGem';
        const id = form.dataset.id;
        const slot = new FormData(form).get('slot');
        if (id && typeof slot === 'string') void this.handleAction(kind, id, slot);
      }),
    );
    this.element.querySelectorAll<HTMLButtonElement>('[data-request-delete]').forEach((button) =>
      button.addEventListener('click', () => {
        const id = button.dataset.requestDelete;
        const character = this.viewModel?.characters.find((candidate) => candidate.id === id);
        if (id && character && canDeleteProfile(character) && this.pending === null) {
          this.deleteConfirmationId = id;
          this.render();
        }
      }),
    );
    this.element.querySelector('[data-cancel-delete]')?.addEventListener('click', () => {
      this.deleteConfirmationId = null;
      this.render();
    });
  }

  private async handleCreateCharacter(form: HTMLFormElement): Promise<void> {
    if (!canRequestMetaAction(this.controller, 'createCharacter', this.pending)) return;
    const data = new FormData(form);
    const name = data.get('name');
    const blessingPathId = data.get('blessingPathId');
    if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 32) {
      this.notice = {
        type: 'error',
        text: 'Le nom du personnage doit contenir entre 1 et 32 caractères.',
      };
      this.render();
      return;
    }
    if (typeof blessingPathId !== 'string' || blessingPathId.length === 0) {
      this.notice = { type: 'error', text: 'Choisissez une voie de bénédiction.' };
      this.render();
      return;
    }
    this.pending = { kind: 'createCharacter', id: blessingPathId };
    this.notice = { type: 'info', text: 'Création du profil en cours…' };
    this.render();
    try {
      const result = await this.controller.createCharacter!(name.trim(), blessingPathId);
      if (result.viewModel) this.viewModel = result.viewModel;
      this.notice = { type: 'success', text: result.message ?? 'Profil créé et confirmé.' };
    } catch (error) {
      this.notice = { type: 'error', text: this.describeError(error) };
    } finally {
      this.pending = null;
      this.render();
    }
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
    if (slot !== undefined && (!Number.isInteger(slot) || slot < 0 || slot > 2)) {
      this.notice = { type: 'error', text: 'Choisissez un emplacement valide.' };
      this.render();
      return;
    }
    if (kind === 'deleteCharacter') {
      const character = this.viewModel?.characters.find((candidate) => candidate.id === id);
      if (!character || !canDeleteProfile(character) || this.deleteConfirmationId !== id) {
        this.notice = { type: 'error', text: 'Le profil par défaut ne peut pas être supprimé.' };
        this.render();
        return;
      }
    }
    this.pending = slot === undefined ? { kind, id } : { kind, id, slot };
    this.notice = { type: 'info', text: 'Validation de l’atelier en cours…' };
    this.render();
    try {
      let result: MetaActionResult;
      switch (kind) {
        case 'createCharacter':
          throw new Error('Utilisez le formulaire pour créer un profil.');
        case 'activateCharacter':
          result = await this.controller.activateCharacter!(id);
          break;
        case 'deleteCharacter':
          result = await this.controller.deleteCharacter!(id);
          this.deleteConfirmationId = null;
          break;
        case 'unlockBlessing':
          result = await this.controller.unlockBlessing!(id);
          break;
        case 'purchaseSkill':
          result = await this.controller.purchaseSkill!(id);
          break;
        case 'equipSkill':
          if (slot === undefined) throw new Error('Choisissez un emplacement de compétence.');
          result = await this.controller.equipSkill!(id, slot);
          break;
        case 'unequipSkill':
          result = await this.controller.unequipSkill!(Number(id));
          break;
        case 'socketGem':
          if (slot === undefined) throw new Error('Choisissez une châsse pour cette gemme.');
          result = await this.controller.socketGem!(id, slot);
          break;
        case 'unsocketGem':
          result = await this.controller.unsocketGem!(Number(id));
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
