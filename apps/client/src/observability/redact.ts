/**
 * Assainissement des valeurs qui entrent dans la télémétrie.
 *
 * La spécification interdit d'émettre l'adresse e-mail, le pseudonyme, un mot de passe, un jeton
 * ou un secret TOTP. Ce module est le seul endroit où l'on transforme une valeur avant de l'attacher à un span ou à un
 * enregistrement : centraliser rend la règle vérifiable par un test.
 */

/** Longueur maximale d'un attribut textuel émis. Au-delà, la valeur est tronquée. */
export const MAX_ATTRIBUTE_LENGTH = 128;

/** Borne une valeur textuelle avant de l'attacher à un attribut, quelle qu'en soit l'origine. */
export function boundedAttribute(value: string, maxLength = MAX_ATTRIBUTE_LENGTH): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

/**
 * Message d'erreur exploitable, sans jamais recopier un objet inconnu.
 *
 * Une erreur venant du réseau ou d'une bibliothèque peut transporter n'importe quoi — y compris
 * un jeton dans une URL. On n'en garde que le nom et le message, bornés.
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) {
    return boundedAttribute(`${error.name}: ${error.message}`);
  }
  return boundedAttribute(typeof error === 'string' ? error : 'erreur non typée');
}
