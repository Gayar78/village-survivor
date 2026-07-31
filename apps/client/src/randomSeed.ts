/**
 * Graine de monde : huit caractères hexadécimaux tirés d'une source cryptographique.
 *
 * On utilise volontairement `crypto.getRandomValues` et non `crypto.randomUUID`. Cette
 * dernière n'est exposée que dans un **contexte sécurisé** : elle vaut `undefined` sur une
 * page servie en clair depuis une adresse de réseau local (`http://192.168.x.x`), ce qui
 * faisait échouer le lancement d'une partie dès que le jeu n'était plus servi depuis
 * `localhost`. `getRandomValues`, elle, est disponible dans tous les contextes.
 *
 * Quatre octets suffisent : la graine sert à rendre une partie reproductible, pas à garantir
 * l'unicité mondiale d'un identifiant.
 */
export function randomSeed(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
