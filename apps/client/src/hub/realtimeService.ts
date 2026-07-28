// Couche « temps réel » du hub multijoueur, bâtie sur Supabase Realtime v2.
//
// Trois familles de canaux sont gérées :
//   1. `presence`            : présence globale (statut de chaque joueur connecté),
//                              keyée par userId. L'UI filtrera aux amis.
//   2. `hub:<code>`          : un hub (lobby) identifié par le code perso à 8 car.
//                              de son propriétaire ; présence keyée par userId. Le
//                              chef = le propriétaire du code, repéré via `isOwner`.
//   3. `user:<userId>`       : canal perso de réception des invitations (broadcast).
//
// La vérification étant statique (pas de serveur Supabase live), les points qui
// dépendent réellement du réseau sont annotés « NOTE live-test ».

import { supabase } from '../account/supabaseClient.js';
import {
  HUB_CAPACITY,
  type HubInvite,
  type HubMember,
  type HubState,
  type LaunchPayload,
  type PresenceStatus,
} from './types.js';
import type { RealtimeChannel } from '@supabase/supabase-js';

// --- Contrat public (consommé par le lot UI) ----------------------------------

/** Entrée de présence globale exposée à l'UI (dérivée du canal `presence`). */
export interface PresenceEntry {
  userId: string;
  displayName: string;
  status: PresenceStatus;
  hubCode?: string;
}

/** Identité minimale du joueur local passée à `start()`. */
export interface RealtimeSession {
  userId: string;
  displayName: string;
}

export interface RealtimeService {
  /** Démarre la présence globale + le canal perso d'invitations. myHubCode = code perso du joueur. */
  start(session: RealtimeSession, myHubCode: string): Promise<void>;
  stop(): Promise<void>;
  /** Met à jour son propre statut de présence (et le hub courant). */
  setStatus(status: PresenceStatus, hubCode?: string): Promise<void>;
  /** Abonnement à la présence globale : renvoie une Map userId -> PresenceEntry. Renvoie une fonction de désabonnement. */
  onPresence(cb: (entries: Map<string, PresenceEntry>) => void): () => void;
  /** Rejoint le hub d'un code donné (celui du chef). */
  joinHub(code: string): Promise<void>;
  /** Quitte le hub courant (revient à son propre hub). */
  leaveHub(): Promise<void>;
  /** Code du hub courant, ou null si dans son propre hub. */
  currentHubCode(): string | null;
  /** Abonnement à l'état du hub courant (null quand on n'est dans aucun hub d'autrui). */
  onHubState(cb: (state: HubState | null) => void): () => void;
  /** Réservé au chef : exclut un membre. */
  kick(userId: string): Promise<void>;
  /** Réservé au chef : lance la partie pour tout le hub. */
  launch(payload: LaunchPayload): Promise<void>;
  onLaunch(cb: (payload: LaunchPayload) => void): () => void;
  onKicked(cb: () => void): () => void;
  /** Invite un ami dans son hub (broadcast vers son canal perso). */
  invite(
    friendUserId: string,
    myHubCode: string,
    fromDisplayName: string,
    fromUserId: string,
  ): Promise<void>;
  onInvite(cb: (invite: HubInvite) => void): () => void;
}

// --- Types de payload internes (présence + broadcast) -------------------------

/** Payload de présence poussé sur le canal global `presence`. */
type GlobalPresencePayload = {
  userId: string;
  displayName: string;
  status: PresenceStatus;
  hubCode?: string;
};

/** Payload de présence poussé sur un canal `hub:<code>`. */
type HubPresencePayload = {
  userId: string;
  displayName: string;
  /** true uniquement pour le propriétaire du code = chef du hub. */
  isOwner: boolean;
};

/** Payload broadcast d'exclusion (event `kick`). */
type KickPayload = { userId: string };

// --- État du module (instance unique) -----------------------------------------

let sessionRef: RealtimeSession | null = null;
let myHubCodeRef: string | null = null;

let currentStatus: PresenceStatus = 'offline';
/** hubCode publié dans la présence globale (undefined si aucun). */
let statusHubCode: string | undefined;

let presenceChannel: RealtimeChannel | null = null;
let personalChannel: RealtimeChannel | null = null;
/** Canal du hub actuellement actif (le sien OU celui d'un autre). */
let hubChannel: RealtimeChannel | null = null;
/** Code du hub rejoint (celui d'un autre) ; null quand on est dans son propre hub. */
let joinedHubCode: string | null = null;

const presenceCbs = new Set<(entries: Map<string, PresenceEntry>) => void>();
const hubStateCbs = new Set<(state: HubState | null) => void>();
const launchCbs = new Set<(payload: LaunchPayload) => void>();
const kickedCbs = new Set<() => void>();
const inviteCbs = new Set<(invite: HubInvite) => void>();

// --- Utilitaires de bas niveau ------------------------------------------------

/**
 * S'abonne à un canal et résout dès l'état `SUBSCRIBED`. Les états d'erreur ne
 * bloquent pas (ils sont journalisés puis la promesse est résolue) afin qu'un
 * incident réseau ne fasse jamais crasher le launcher.
 * NOTE live-test : l'ordre/latence réels des statuts dépendent du serveur.
 */
function subscribeChannel(channel: RealtimeChannel): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const settle = (): void => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    // `status` typé `string` : évite les frictions de comparaison avec l'enum.
    channel.subscribe((status: string, err?: Error) => {
      if (status === 'SUBSCRIBED') {
        settle();
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        console.warn(`[realtimeService] canal « ${channel.topic} » : statut ${status}`, err);
        settle();
      }
    });
  });
}

/**
 * Retire proprement un canal (untrack optionnel puis removeChannel). Toutes les
 * erreurs sont avalées (journalisées) : le nettoyage ne doit jamais lever.
 */
async function disposeChannel(
  channel: RealtimeChannel | null,
  untrackFirst: boolean,
): Promise<void> {
  if (channel === null) {
    return;
  }
  if (untrackFirst) {
    try {
      await channel.untrack();
    } catch (err) {
      console.warn('[realtimeService] untrack a échoué', err);
    }
  }
  try {
    const res = await supabase.removeChannel(channel);
    if (res !== 'ok') {
      console.warn(`[realtimeService] removeChannel a renvoyé « ${res} »`);
    }
  } catch (err) {
    console.warn('[realtimeService] removeChannel a levé une erreur', err);
  }
}

// --- Reconstruction des états depuis la présence ------------------------------

function computePresenceEntries(channel: RealtimeChannel): Map<string, PresenceEntry> {
  const state = channel.presenceState<GlobalPresencePayload>();
  const entries = new Map<string, PresenceEntry>();
  for (const presences of Object.values(state)) {
    const p = presences[0];
    if (p === undefined) {
      continue;
    }
    entries.set(p.userId, {
      userId: p.userId,
      displayName: p.displayName,
      status: p.status,
      ...(p.hubCode !== undefined ? { hubCode: p.hubCode } : {}),
    });
  }
  return entries;
}

function computeHubState(channel: RealtimeChannel, code: string): HubState {
  const state = channel.presenceState<HubPresencePayload>();
  const members: HubMember[] = [];
  let chiefUserId = '';
  for (const presences of Object.values(state)) {
    const p = presences[0];
    if (p === undefined) {
      continue;
    }
    const isChief = p.isOwner === true;
    if (isChief) {
      chiefUserId = p.userId;
    }
    members.push({ userId: p.userId, displayName: p.displayName, isChief });
  }
  return { code, chiefUserId, members, capacity: HUB_CAPACITY };
}

/**
 * État du hub courant à pousser via `onHubState`.
 *
 * Choix de conception : on renvoie l'état du canal de hub actif (le sien OU
 * celui d'un autre) car le CHEF (propriétaire) a besoin de voir les membres qui
 * rejoignent SON hub pour pouvoir les exclure / lancer la partie — sans quoi
 * `kick`/`launch` seraient inutilisables côté chef. Conformément au contrat, on
 * renvoie `null` tant qu'on est seul dans son propre hub (pas de « lobby »
 * actif) et quand aucun canal de hub n'est actif (avant start / après stop).
 */
function currentHubState(): HubState | null {
  if (hubChannel === null) {
    return null;
  }
  const code = joinedHubCode ?? myHubCodeRef ?? '';
  const state = computeHubState(hubChannel, code);
  if (joinedHubCode === null && state.members.length <= 1) {
    return null;
  }
  return state;
}

// --- Diffusion aux abonnés ----------------------------------------------------

function emitPresence(): void {
  const entries =
    presenceChannel !== null
      ? computePresenceEntries(presenceChannel)
      : new Map<string, PresenceEntry>();
  for (const cb of presenceCbs) {
    cb(entries);
  }
}

function emitHubState(): void {
  const state = currentHubState();
  for (const cb of hubStateCbs) {
    cb(state);
  }
}

function emitLaunch(payload: LaunchPayload): void {
  for (const cb of launchCbs) {
    cb(payload);
  }
}

function emitInvite(invite: HubInvite): void {
  for (const cb of inviteCbs) {
    cb(invite);
  }
}

function emitKicked(): void {
  for (const cb of kickedCbs) {
    cb();
  }
}

// --- Publication de la présence (track) ---------------------------------------

async function trackGlobalPresence(): Promise<void> {
  if (presenceChannel === null || sessionRef === null) {
    return;
  }
  const payload: GlobalPresencePayload = {
    userId: sessionRef.userId,
    displayName: sessionRef.displayName,
    status: currentStatus,
    ...(statusHubCode !== undefined ? { hubCode: statusHubCode } : {}),
  };
  const res = await presenceChannel.track(payload);
  if (res !== 'ok') {
    console.warn(`[realtimeService] track présence globale : « ${res} »`);
  }
}

async function trackHubPresence(isOwner: boolean): Promise<void> {
  if (hubChannel === null || sessionRef === null) {
    return;
  }
  const payload: HubPresencePayload = {
    userId: sessionRef.userId,
    displayName: sessionRef.displayName,
    isOwner,
  };
  const res = await hubChannel.track(payload);
  if (res !== 'ok') {
    console.warn(`[realtimeService] track présence hub : « ${res} »`);
  }
}

// --- Ouverture / fermeture des canaux -----------------------------------------

async function openPresenceChannel(userId: string): Promise<void> {
  const channel = supabase.channel('presence', { config: { presence: { key: userId } } });
  channel.on('presence', { event: 'sync' }, () => emitPresence());
  channel.on('presence', { event: 'join' }, () => emitPresence());
  channel.on('presence', { event: 'leave' }, () => emitPresence());
  presenceChannel = channel;
  await subscribeChannel(channel);
  await trackGlobalPresence();
}

async function openPersonalChannel(userId: string): Promise<void> {
  const channel = supabase.channel(`user:${userId}`);
  // Overload générique typée : `message.payload` est un HubInvite.
  channel.on<HubInvite>('broadcast', { event: 'invite' }, (message) => {
    const invite = message.payload;
    // Garde de robustesse : un payload malformé (réseau) est ignoré.
    if (
      typeof invite?.fromUserId === 'string' &&
      typeof invite.fromDisplayName === 'string' &&
      typeof invite.hubCode === 'string'
    ) {
      emitInvite({
        fromUserId: invite.fromUserId,
        fromDisplayName: invite.fromDisplayName,
        hubCode: invite.hubCode,
      });
    }
  });
  personalChannel = channel;
  await subscribeChannel(channel);
}

/** Ouvre un canal de hub (le sien avec isOwner=true, celui d'un autre avec false). */
async function openHubChannel(code: string, isOwner: boolean): Promise<void> {
  if (sessionRef === null) {
    return;
  }
  const channel = supabase.channel(`hub:${code}`, {
    config: { presence: { key: sessionRef.userId } },
  });
  channel.on('presence', { event: 'sync' }, () => emitHubState());
  channel.on('presence', { event: 'join' }, () => emitHubState());
  channel.on('presence', { event: 'leave' }, () => emitHubState());

  channel.on<KickPayload>('broadcast', { event: 'kick' }, (message) => {
    const target = message.payload;
    if (typeof target?.userId === 'string') {
      void handleKick(target.userId);
    }
  });
  channel.on<LaunchPayload>('broadcast', { event: 'launch' }, (message) => {
    const p = message.payload;
    if (typeof p?.seed === 'string' && typeof p.playerCount === 'number') {
      // On transmet aussi les champs co-op (code/hostId/roster) quand ils sont présents
      // et bien formés, sans jamais laisser un payload malformé casser le lancement.
      const coop =
        typeof p.code === 'string' && typeof p.hostId === 'string' && Array.isArray(p.roster)
          ? {
              code: p.code,
              hostId: p.hostId,
              roster: p.roster.filter(
                (entry): entry is { id: string; name: string } =>
                  typeof entry?.id === 'string' && typeof entry.name === 'string',
              ),
            }
          : {};
      emitLaunch({ seed: p.seed, playerCount: p.playerCount, ...coop });
    }
  });

  hubChannel = channel;
  await subscribeChannel(channel);
  await trackHubPresence(isOwner);
}

/** Réaction à un broadcast `kick` : si je suis la cible, je quitte le hub. */
async function handleKick(targetUserId: string): Promise<void> {
  if (sessionRef === null || joinedHubCode === null) {
    return;
  }
  if (targetUserId !== sessionRef.userId) {
    return;
  }
  await leaveHubInternal();
  emitKicked();
}

/** Quitte le hub rejoint et revient dans son propre hub (propriétaire). */
async function leaveHubInternal(): Promise<void> {
  if (myHubCodeRef === null) {
    return;
  }
  await disposeChannel(hubChannel, true);
  hubChannel = null;
  joinedHubCode = null;
  await openHubChannel(myHubCodeRef, true);
  await setStatusInternal('online', undefined);
  emitHubState();
}

async function setStatusInternal(
  status: PresenceStatus,
  hubCode: string | undefined,
): Promise<void> {
  currentStatus = status;
  statusHubCode = hubCode;
  await trackGlobalPresence();
}

// --- Implémentation des méthodes publiques ------------------------------------

async function doStart(session: RealtimeSession, myHubCode: string): Promise<void> {
  // Idempotence : un redémarrage réinitialise proprement les canaux existants.
  if (sessionRef !== null) {
    await doStop();
  }
  sessionRef = session;
  myHubCodeRef = myHubCode;
  currentStatus = 'online';
  statusHubCode = undefined;
  joinedHubCode = null;

  await openPresenceChannel(session.userId);
  await openPersonalChannel(session.userId);
  // On rejoint son propre hub en tant que propriétaire (chef).
  await openHubChannel(myHubCode, true);

  emitPresence();
  emitHubState();
}

async function doStop(): Promise<void> {
  await disposeChannel(hubChannel, true);
  hubChannel = null;
  await disposeChannel(personalChannel, false);
  personalChannel = null;
  await disposeChannel(presenceChannel, true);
  presenceChannel = null;

  joinedHubCode = null;
  currentStatus = 'offline';
  statusHubCode = undefined;
  sessionRef = null;
  myHubCodeRef = null;

  emitPresence();
  emitHubState();
}

async function doJoinHub(code: string): Promise<void> {
  if (sessionRef === null) {
    console.warn('[realtimeService] joinHub appelé avant start()');
    return;
  }
  // On quitte le hub courant (le sien ou un autre) avant de rejoindre.
  await disposeChannel(hubChannel, true);
  hubChannel = null;
  joinedHubCode = code;
  await openHubChannel(code, false);
  await setStatusInternal('in-hub', code);
  emitHubState();
}

async function doLeaveHub(): Promise<void> {
  // Rien à faire si on est déjà dans son propre hub.
  if (joinedHubCode === null) {
    return;
  }
  await leaveHubInternal();
}

async function doKick(userId: string): Promise<void> {
  // NOTE live-test : l'autorité « chef » n'est pas vérifiée côté serveur ici ;
  // seul le propriétaire du hub devrait appeler kick (garanti par l'UI + RLS
  // éventuelles). Le membre ciblé se retire lui-même à réception du broadcast.
  if (hubChannel === null) {
    console.warn('[realtimeService] kick sans hub actif');
    return;
  }
  const res = await hubChannel.send({ type: 'broadcast', event: 'kick', payload: { userId } });
  if (res !== 'ok') {
    console.warn(`[realtimeService] envoi kick : « ${res} »`);
  }
}

async function doLaunch(payload: LaunchPayload): Promise<void> {
  if (hubChannel === null) {
    console.warn('[realtimeService] launch sans hub actif');
    return;
  }
  const res = await hubChannel.send({ type: 'broadcast', event: 'launch', payload });
  if (res !== 'ok') {
    console.warn(`[realtimeService] envoi launch : « ${res} »`);
  }
  // NOTE live-test : par défaut un broadcast n'est pas renvoyé à son émetteur
  // (config.broadcast.self=false). Le chef déclenche donc son propre lancement
  // localement pour démarrer sa partie en même temps que les autres membres.
  emitLaunch(payload);
}

async function doInvite(
  friendUserId: string,
  myHubCode: string,
  fromDisplayName: string,
  fromUserId: string,
): Promise<void> {
  const invite: HubInvite = { fromUserId, fromDisplayName, hubCode: myHubCode };
  // Canal éphémère vers le canal perso de l'ami : on s'y abonne le temps
  // d'émettre l'invitation, puis on le retire.
  const channel = supabase.channel(`user:${friendUserId}`);
  await subscribeChannel(channel);
  const res = await channel.send({ type: 'broadcast', event: 'invite', payload: invite });
  if (res !== 'ok') {
    console.warn(`[realtimeService] envoi invite : « ${res} »`);
  }
  await disposeChannel(channel, false);
}

// --- Abonnements (renvoient une fonction de désabonnement) ---------------------

function onPresence(cb: (entries: Map<string, PresenceEntry>) => void): () => void {
  presenceCbs.add(cb);
  // Poussée immédiate de l'état courant pour l'abonné.
  cb(
    presenceChannel !== null
      ? computePresenceEntries(presenceChannel)
      : new Map<string, PresenceEntry>(),
  );
  return () => {
    presenceCbs.delete(cb);
  };
}

function onHubState(cb: (state: HubState | null) => void): () => void {
  hubStateCbs.add(cb);
  cb(currentHubState());
  return () => {
    hubStateCbs.delete(cb);
  };
}

function onLaunch(cb: (payload: LaunchPayload) => void): () => void {
  launchCbs.add(cb);
  return () => {
    launchCbs.delete(cb);
  };
}

function onKicked(cb: () => void): () => void {
  kickedCbs.add(cb);
  return () => {
    kickedCbs.delete(cb);
  };
}

function onInvite(cb: (invite: HubInvite) => void): () => void {
  inviteCbs.add(cb);
  return () => {
    inviteCbs.delete(cb);
  };
}

// --- Instance unique exportée -------------------------------------------------

export const realtimeService: RealtimeService = {
  start: (session, myHubCode) => doStart(session, myHubCode),
  stop: () => doStop(),
  setStatus: (status, hubCode) => setStatusInternal(status, hubCode),
  onPresence,
  joinHub: (code) => doJoinHub(code),
  leaveHub: () => doLeaveHub(),
  currentHubCode: () => joinedHubCode,
  onHubState,
  kick: (userId) => doKick(userId),
  launch: (payload) => doLaunch(payload),
  onLaunch,
  onKicked,
  invite: (friendUserId, myHubCode, fromDisplayName, fromUserId) =>
    doInvite(friendUserId, myHubCode, fromDisplayName, fromUserId),
  onInvite,
};
