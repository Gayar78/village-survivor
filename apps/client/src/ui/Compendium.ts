/** Vue lecture seule des systèmes actuellement jouables dans Tower Phase 1. */
export class Compendium {
  private readonly element: HTMLElement;
  private readonly onBack: () => void;

  public constructor(element: HTMLElement, onBack: () => void) {
    this.element = element;
    this.onBack = onBack;
    this.element.classList.add('compendium');
    this.render();
  }

  public show(): void {
    this.element.classList.remove('compendium--hidden');
    this.element.querySelector<HTMLElement>('#compendium-back')?.focus();
  }

  public hide(): void {
    this.element.classList.add('compendium--hidden');
  }

  private render(): void {
    this.element.innerHTML = `
      <main class="compendium__shell" tabindex="-1">
        <header class="compendium__header">
          <div>
            <p class="main-menu__kicker">Guide de survie</p>
            <h1>Annuaire</h1>
            <p>Les bases jouables de Tower · Phase 1.</p>
          </div>
          <button type="button" class="compendium__back" id="compendium-back">Retour au menu</button>
        </header>

        <div class="compendium__grid">
          <section class="compendium__section">
            <h2>Cœur du village</h2>
            <p>
              Le Cœur est l’objectif commun. Les monstres le prennent pour cible lorsqu’aucun
              joueur proche ne détourne leur attention : sa destruction met fin à la partie.
            </p>
          </section>
          <section class="compendium__section">
            <h2>Tourelles</h2>
            <p>
              Quatre tourelles fixes couvrent les points cardinaux. Approchez-vous pour ouvrir
              leur boutique, réparer avec la Ferraille et améliorer dégâts, portée, cadence,
              intégrité ou énergie.
            </p>
          </section>
          <section class="compendium__section">
            <h2>Monstres et vagues</h2>
            <p>
              Les chasseurs et coureurs mettent la pression, les brutes encaissent davantage,
              et les kamikazes explosent au contact. Les vagues reviennent régulièrement et
              leur budget augmente avec le temps et la taille de l’équipe.
            </p>
          </section>
          <section class="compendium__section">
            <h2>Ressources</h2>
            <p>
              Les monstres vaincus lâchent de la Ferraille commune, utilisée par les tourelles.
              Chaque élimination rapporte aussi expérience et or personnel ; choisissez une
              amélioration parmi trois cartes à chaque montée de niveau.
            </p>
          </section>
          <section class="compendium__section compendium__section--wide">
            <h2>Commandes</h2>
            <dl class="compendium__controls">
              <div><dt>ZQSD / WASD / flèches</dt><dd>Se déplacer</dd></div>
              <div><dt>Souris</dt><dd>Viser et tirer</dd></div>
              <div><dt>E</dt><dd>Ouvrir ou fermer la boutique près d’une tourelle</dd></div>
              <div><dt>1 · 2 · 3</dt><dd>Choisir une carte de niveau proposée</dd></div>
              <div><dt>Échap</dt><dd>Fermer la boutique ou revenir au lobby</dd></div>
            </dl>
          </section>
        </div>
      </main>
    `;
    this.element.querySelector('#compendium-back')?.addEventListener('click', () => this.onBack());
  }
}
