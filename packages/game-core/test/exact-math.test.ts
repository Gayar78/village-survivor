import { describe, expect, it } from 'vitest';

import {
  exactCos,
  exactDirectionTo,
  exactLength,
  exactRotate,
  exactSin,
  exactUnitFromAngle,
} from '../src/exact-math.js';

/**
 * Ces fonctions existent pour une seule raison : donner le **même** résultat sur tous les
 * moteurs JavaScript. Cette propriété-là ne peut pas être testée depuis un seul moteur ; c'est
 * la garde d'architecture (`exact-math-guard.test.ts`) qui la protège, en interdisant l'usage
 * des fonctions approximées dans le cœur de simulation.
 *
 * Les tests ci-dessous vérifient l'autre moitié du contrat : que ces implémentations sont
 * justes. Une fonction déterministe mais fausse ne vaudrait rien.
 */
describe('arithmétique exactement reproductible', () => {
  // Écart maximal mesuré face au moteur : 2,5e-10. Le seuil laisse une marge sans masquer une
  // régression de précision d'un ordre de grandeur.
  const TOLERANCE = 1e-9;

  it('calcule une longueur conforme à la référence du moteur', () => {
    const cases: readonly (readonly [number, number])[] = [
      [3, 4],
      [0, 0],
      [-778.0778673477471, 325.7901556789875],
      [1e-8, 1e-8],
      [6000, -6000],
    ];
    for (const [x, y] of cases) {
      expect(exactLength(x, y)).toBeCloseTo(Math.hypot(x, y), 9);
    }
  });

  it('calcule un sinus et un cosinus conformes à la référence du moteur', () => {
    // Balayage large, y compris hors de [-π, π] pour éprouver la réduction d'argument.
    for (let index = -400; index <= 400; index += 1) {
      const angle = index * 0.05;
      expect(Math.abs(exactSin(angle) - Math.sin(angle))).toBeLessThan(TOLERANCE);
      expect(Math.abs(exactCos(angle) - Math.cos(angle))).toBeLessThan(TOLERANCE);
    }
  });

  it('reste juste sur des angles très grands, où la réduction est mise à l’épreuve', () => {
    for (const angle of [1000, -1000, 12345.6789, -98765.4321]) {
      expect(Math.abs(exactSin(angle) - Math.sin(angle))).toBeLessThan(1e-9);
      expect(Math.abs(exactCos(angle) - Math.cos(angle))).toBeLessThan(1e-9);
    }
  });

  it('respecte l’identité fondamentale sur tout le tour', () => {
    for (let index = 0; index < 360; index += 1) {
      const angle = (index * Math.PI) / 180;
      const norm = exactSin(angle) ** 2 + exactCos(angle) ** 2;
      expect(Math.abs(norm - 1)).toBeLessThan(2 * TOLERANCE);
    }
  });

  it('renvoie zéro plutôt qu’une valeur non finie pour une entrée absurde', () => {
    expect(exactSin(Number.POSITIVE_INFINITY)).toBe(0);
    expect(exactSin(Number.NaN)).toBe(0);
  });

  it('produit un vecteur unitaire à partir d’un angle', () => {
    const unit = exactUnitFromAngle(0.7);
    expect(exactLength(unit.x, unit.y)).toBeCloseTo(1, 12);
  });

  it('donne une direction unitaire entre deux points', () => {
    const direction = exactDirectionTo(10, 10, 13, 14);
    expect(direction).toBeDefined();
    expect(direction?.x).toBeCloseTo(0.6, 12);
    expect(direction?.y).toBeCloseTo(0.8, 12);
  });

  it('refuse une direction entre deux points confondus', () => {
    expect(exactDirectionTo(5, 5, 5, 5)).toBeUndefined();
  });

  it('fait tourner un vecteur en conservant sa longueur', () => {
    const rotated = exactRotate(3, 4, 0.9);
    expect(exactLength(rotated.x, rotated.y)).toBeCloseTo(5, 11);
  });

  it('fait tourner un vecteur d’un quart de tour de façon reconnaissable', () => {
    const rotated = exactRotate(1, 0, Math.PI / 2);
    expect(rotated.x).toBeCloseTo(0, 9);
    expect(rotated.y).toBeCloseTo(1, 9);
  });
});
