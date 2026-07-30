/**
 * Retourne l'index de carte associé au raccourci clavier de niveau.
 *
 * `code` couvre les touches physiques (rangée principale et pavé numérique),
 * tandis que `key` couvre les valeurs produites par les dispositions AZERTY.
 */
export function getTowerLevelShortcutIndex(
  event: Pick<KeyboardEvent, 'code' | 'key'>,
): number | undefined {
  const codeIndex = new Map<string, number>([
    ['Digit1', 0],
    ['Digit2', 1],
    ['Digit3', 2],
    ['Numpad1', 0],
    ['Numpad2', 1],
    ['Numpad3', 2],
  ]).get(event.code);
  if (codeIndex !== undefined) {
    return codeIndex;
  }

  return new Map<string, number>([
    ['1', 0],
    ['&', 0],
    ['2', 1],
    ['é', 1],
    ['3', 2],
    ['"', 2],
  ]).get(event.key);
}

/** Une touche maintenue ne peut pas mettre plusieurs cartes en attente. */
export function canQueueTowerLevelSelection(
  isRepeatedKey: boolean,
  hasPendingSelection: boolean,
): boolean {
  return !isRepeatedKey && !hasPendingSelection;
}

/** La simulation autoritaire accuse un choix quand son offre a disparu. */
export function isTowerLevelSelectionAcknowledged(
  offerId: string,
  currentOfferIds: readonly string[],
): boolean {
  return !currentOfferIds.includes(offerId);
}
