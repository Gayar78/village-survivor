#!/usr/bin/env node
// Prépare le déploiement LAN : détecte l'adresse locale, tire les secrets et écrit
// `deploy/lan/.env` ainsi que le `.env` racine que Vite lit à la compilation.
//
// Lancement : node deploy/lan/setup.mjs [--host 192.168.1.24] [--port 8080] [--force]
//
// Les clés `anon` et `service_role` de Supabase ne sont pas des chaînes arbitraires : ce
// sont des JWT HS256 signés par JWT_SECRET, dont la charge utile porte le rôle Postgres à
// endosser. PostgREST et Realtime les vérifient avec ce même secret, donc les trois valeurs
// doivent être générées ensemble et le restent tant qu'on ne réinitialise pas la base.

import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
const force = args.includes('--force');

/** Adresse IPv4 privée la plus plausible pour joindre cette machine depuis le LAN. */
function detectLanHost() {
  const candidates = [];
  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue;
      // Tailscale et consorts fonctionnent, mais ne sont pas « le LAN » : on les
      // propose en dernier pour ne pas les choisir par accident.
      const rank = /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address)
        ? /^100\./.test(address.address)
          ? 2
          : 0
        : 1;
      candidates.push({ name, address: address.address, rank });
    }
  }
  candidates.sort((a, b) => a.rank - b.rank);
  return candidates;
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

/** JWT HS256 minimal : c'est exactement la forme attendue par Supabase. */
function signJwt(payload, secret) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

const candidates = detectLanHost();
const host = flag('host') ?? candidates[0]?.address;
if (!host) {
  console.error('Aucune adresse IPv4 détectée. Passez-la explicitement : --host 192.168.1.24');
  process.exit(1);
}
const port = flag('port') ?? '8080';
const publicUrl = `http://${host}:${port}`;

const envPath = join(here, '.env');
if (existsSync(envPath) && !force) {
  const existing = readFileSync(envPath, 'utf8');
  const current = /^PUBLIC_URL=(.*)$/m.exec(existing)?.[1];
  console.log(`deploy/lan/.env existe déjà (PUBLIC_URL=${current ?? '?'}).`);
  console.log('Relancez avec --force pour régénérer les secrets.');
  console.log('Attention : régénérer JWT_SECRET invalide la base existante.');
  process.exit(0);
}

const jwtSecret = randomBytes(32).toString('hex');
const issuedAt = Math.floor(Date.now() / 1000);
// Dix ans : ces jetons identifient un rôle, pas une session utilisateur.
const expiresAt = issuedAt + 10 * 365 * 24 * 3600;
const anonKey = signJwt(
  { role: 'anon', iss: 'supabase', iat: issuedAt, exp: expiresAt },
  jwtSecret,
);
const serviceKey = signJwt(
  { role: 'service_role', iss: 'supabase', iat: issuedAt, exp: expiresAt },
  jwtSecret,
);

writeFileSync(
  envPath,
  [
    '# Généré par deploy/lan/setup.mjs — ne pas committer.',
    `PUBLIC_URL=${publicUrl}`,
    `WEB_PORT=${port}`,
    `POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}`,
    `JWT_SECRET=${jwtSecret}`,
    `ANON_KEY=${anonKey}`,
    `SERVICE_ROLE_KEY=${serviceKey}`,
    `SECRET_KEY_BASE=${randomBytes(32).toString('hex')}`,
    '',
  ].join('\n'),
  'utf8',
);

// Vite lit le `.env` de la racine du monorepo (voir `envDir` dans vite.config.ts) et fige
// ces deux valeurs dans le paquet : le client doit donc être reconstruit après ce script.
writeFileSync(
  join(repoRoot, '.env'),
  [
    '# Généré par deploy/lan/setup.mjs pour le déploiement LAN.',
    '# Ces deux valeurs sont figées dans le paquet à la compilation : après toute',
    '# modification, reconstruire le client avec `pnpm build`.',
    `VITE_SUPABASE_URL=${publicUrl}`,
    `VITE_SUPABASE_ANON_KEY=${anonKey}`,
    '',
  ].join('\n'),
  'utf8',
);

console.log(`Adresse retenue : ${publicUrl}`);
if (candidates.length > 1) {
  console.log(
    `Autres adresses détectées : ${candidates
      .slice(1)
      .map((candidate) => `${candidate.address} (${candidate.name})`)
      .join(', ')}`,
  );
}
console.log('Écrit : deploy/lan/.env et .env');
console.log('Suite : pnpm build, puis docker compose -f deploy/lan/docker-compose.yml up -d');
