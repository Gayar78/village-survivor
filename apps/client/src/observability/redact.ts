/**
 * Assainissement des valeurs qui entrent dans la télémétrie.
 *
 * La spécification interdit d'émettre l'adresse e-mail, le pseudonyme, un mot de passe, un jeton
 * ou un secret TOTP, et impose que le code de salon coopératif ne circule que haché. Ce module
 * est le seul endroit où l'on transforme une valeur avant de l'attacher à un span ou à un
 * enregistrement : centraliser rend la règle vérifiable par un test.
 */

/** Longueur maximale d'un attribut textuel émis. Au-delà, la valeur est tronquée. */
export const MAX_ATTRIBUTE_LENGTH = 128;

/**
 * Condensat FNV-1a 64 bits, en hexadécimal.
 *
 * **Ce n'est pas une protection cryptographique**, et il ne faut pas le lire comme telle : un
 * code de salon de quelques caractères se retrouve par force brute quel que soit le condensat
 * employé. Ce que le hachage évite, c'est la **divulgation directe** — un code lisible dans une
 * vue de télémétrie ouvrirait le canal temps réel à qui passe devant l'écran. Il permet aussi de
 * corréler deux pairs d'une même partie sans publier leur clé d'entrée.
 */
export function hashRoomCode(code: string): string {
  const OFFSET = 0xcbf2_9ce4_8422_2325n;
  const PRIME = 0x0000_0100_0000_01b3n;
  const MASK = 0xffff_ffff_ffff_ffffn;
  let hash = OFFSET;
  for (let index = 0; index < code.length; index += 1) {
    hash ^= BigInt(code.charCodeAt(index) & 0xff);
    hash = (hash * PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, '0');
}

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
