export interface ControlEntry {
  key: string;
  label: string;
}

/** Liste des contrôles, partagée entre le menu principal et le menu Échap. */
export const CONTROLS: readonly ControlEntry[] = [
  { key: 'Clic droit', label: 'Déplacement (maintenir pour suivre la souris)' },
  { key: 'Clic gauche', label: 'Récolter / réparer / échanger au village' },
  { key: 'I', label: 'Inventaire' },
  { key: 'B', label: 'Fabriquer une baliste' },
  { key: 'Espace', label: 'Fente (épée)' },
  { key: 'Q', label: 'Barrière' },
  { key: 'E', label: 'Soin (vol de vie 50% pendant 5s)' },
  { key: 'F', label: 'Améliorations en attente, puis 1 / 2 / 3' },
  { key: 'Échap', label: 'Menu pause' },
];
