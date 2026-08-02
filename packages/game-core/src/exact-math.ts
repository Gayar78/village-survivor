/**
 * Opérations mathématiques **exactement reproductibles d'un moteur JavaScript à l'autre**.
 *
 * ECMAScript ne spécifie exactement que les opérateurs arithmétiques, `Math.sqrt`, `Math.round`
 * et la lecture des littéraux numériques. `Math.cos`, `Math.sin`, `Math.atan2` et `Math.hypot`
 * sont « approximés par l'implémentation » : chaque moteur a le droit de renvoyer une valeur
 * différente, et ils ne s'en privent pas.
 *
 * Mesures du 1er août 2026 sur trois navigateurs, avec 200 000 entrées identiques :
 *
 * | Fonction | Chromium 148 | Firefox 153 | Edge 150 |
 * |---|---|---|---|
 * | `Math.hypot` | `f7f3f676…` | `e28fa4b0…` | `f7f3f676…` |
 * | `Math.atan2` | `297ed15f…` | `297ed15f…` | `c15c5453…` |
 * | `Math.cos`   | `547d5fdb…` | `a8631c79…` | `c836e13d…` |
 * | `Math.sin`   | `fc8960a3…` | `06b8429d…` | `b9fee274…` |
 *
 * Edge 150 partage pourtant le moteur de Chromium 148 : la divergence existe **aussi entre deux
 * versions du même moteur**. Aucune consigne d'usage ne peut donc protéger la coopération, qui
 * exige un accord au bit près entre tous les pairs.
 *
 * Ce module n'emploie que des opérations exactement spécifiées. Ses résultats sont identiques
 * sur tout moteur conforme, ce qui est la seule propriété qui compte ici — la précision absolue
 * vient loin derrière, à l'échelle d'un jeu où les positions valent quelques milliers d'unités.
 */

/** π et ses dérivés, écrits en littéraux : leur lecture est exactement spécifiée. */
const PI = 3.141592653589793;
const TWO_PI = 6.283185307179586;
const HALF_PI = 1.5707963267948966;

/**
 * Coefficients minimax du noyau sinus sur `[-π/2, π/2]`, repris de la bibliothèque de référence
 * fdlibm. Écrits en littéraux, ils sont donc lus à l'identique partout.
 */
const S3 = -0.16666666666666632;
const S5 = 0.008333333333224894;
const S7 = -0.00019841269829857993;
const S9 = 0.0000027557313707070068;
const S11 = -2.5050760253406863e-8;
const S13 = 1.58969099521155e-10;

/**
 * Longueur d'un vecteur, en remplacement de `Math.hypot`.
 *
 * `Math.sqrt` est correctement arrondi par la spécification, et la multiplication comme
 * l'addition sont exactes : le résultat est donc identique sur tout moteur. `Math.hypot` évite
 * en théorie les dépassements sur des valeurs extrêmes ; à l'échelle du jeu — coordonnées
 * bornées à quelques milliers — ce risque n'existe pas.
 */
export function exactLength(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/**
 * Sinus déterministe.
 *
 * Réduction de l'argument à `[-π/2, π/2]` par soustraction d'un multiple entier de `2π`, puis
 * par symétrie du sinus, avant évaluation d'un polynôme impair par la méthode de Horner. Seules
 * des opérations exactement spécifiées interviennent : `Math.round`, `+`, `-`, `*`.
 *
 * Écart mesuré avec `Math.sin` : **2,5 × 10⁻¹⁰** au maximum. C'est moins précis qu'un moteur —
 * le polynôme est évalué sur `[-π/2, π/2]` là où les bibliothèques de référence se ramènent à
 * `[-π/4, π/4]` avec deux noyaux — et cela n'a aucune importance ici : appliqué à une vitesse de
 * 950 unités par seconde, cet écart déplace un projectile de moins d'un millionième d'unité,
 * quand le plus petit monstre en mesure neuf de rayon.
 *
 * Ce qui compte n'est pas d'être plus juste que le moteur, mais de donner **la même valeur sur
 * tous les postes**. Un raffinement à deux noyaux reste possible si un besoin réel apparaît.
 */
export function exactSin(angle: number): number {
  if (!Number.isFinite(angle)) {
    return 0;
  }
  // Réduction dans [-π, π]. `Math.round` est exactement spécifié.
  let x = angle - TWO_PI * Math.round(angle / TWO_PI);
  // Réduction dans [-π/2, π/2] : sin(π − x) = sin(x), sin(−π − x) = sin(x).
  if (x > HALF_PI) {
    x = PI - x;
  } else if (x < -HALF_PI) {
    x = -PI - x;
  }
  const square = x * x;
  const polynomial =
    S3 + square * (S5 + square * (S7 + square * (S9 + square * (S11 + square * S13))));
  return x + x * square * polynomial;
}

/** Cosinus déterministe, dérivé du sinus par décalage d'un quart de tour. */
export function exactCos(angle: number): number {
  return exactSin(angle + HALF_PI);
}

/**
 * Vecteur unitaire d'un angle, forme la plus fréquente dans la simulation.
 *
 * À n'employer que lorsqu'un angle existe réellement — par exemple une dispersion de tir. Pour
 * viser une cible, préférer `exactDirectionTo` : passer par un angle pour revenir à un vecteur
 * coûte plus cher et perd de la précision sans rien apporter.
 */
export function exactUnitFromAngle(angle: number): { x: number; y: number } {
  return { x: exactCos(angle), y: exactSin(angle) };
}

/**
 * Direction normalisée d'un point vers un autre, ou `undefined` si les deux se confondent.
 *
 * Remplace l'enchaînement `atan2` puis `cos`/`sin` que la simulation employait pour viser. Le
 * détour par l'angle était à la fois la source de la divergence entre navigateurs et un calcul
 * inutile : la direction s'obtient directement, avec des opérations exactes et moins de travail.
 */
export function exactDirectionTo(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): { x: number; y: number } | undefined {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const length = exactLength(dx, dy);
  if (length <= 0) {
    return undefined;
  }
  return { x: dx / length, y: dy / length };
}

/**
 * Fait tourner un vecteur d'un angle donné, sans passer par sa direction absolue.
 *
 * Utilisé pour la dispersion du tir multiple, seul endroit de la simulation où un angle
 * arbitraire doit réellement être appliqué.
 */
export function exactRotate(x: number, y: number, angle: number): { x: number; y: number } {
  const cos = exactCos(angle);
  const sin = exactSin(angle);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}
