// Types partagés de la couche « hub multijoueur » (étape 1 : social).
// Consommés par friendsService (données Supabase), realtimeService (Supabase
// Realtime : présence, hub, invitations) et l'UI du hub.

/** État de présence d'un joueur, dérivé du canal de présence global Supabase. */
export type PresenceStatus = 'online' | 'in-hub' | 'in-game' | 'offline';

/** Un ami, avec sa présence courante (statut + éventuel hub rejoignable). */
export interface Friend {
  userId: string;
  displayName: string;
  friendCode: string;
  status: PresenceStatus;
  /** Code du hub où l'ami se trouve, s'il est joignable (sinon undefined). */
  hubCode?: string;
}

/** Demande d'ami reçue, en attente d'acceptation. */
export interface IncomingFriendRequest {
  requestId: string;
  fromUserId: string;
  fromDisplayName: string;
  fromFriendCode: string;
}

/** Un membre d'un hub (lobby). */
export interface HubMember {
  userId: string;
  displayName: string;
  isChief: boolean;
}

/** État courant d'un hub (lobby), reconstruit depuis la présence du canal du hub. */
export interface HubState {
  /** Code à 8 caractères du hub (= code personnel du chef). */
  code: string;
  chiefUserId: string;
  members: HubMember[];
  /** Nombre maximum de membres autorisés dans un hub. */
  capacity: number;
}

/** Invitation reçue en temps réel (déclenche une pop-up côté UI). */
export interface HubInvite {
  fromUserId: string;
  fromDisplayName: string;
  hubCode: string;
}

/**
 * Descripteur public minimal d'une partie co-op encore active. Le serveur reste
 * seul juge du roster et de la fenêtre de reconnexion.
 */
export interface ActiveGameDescriptor {
  roomId: string;
}

/** Paramètres d'un lancement de partie diffusé par le chef à tout le hub. */
export interface LaunchPayload {
  /** Référence opaque créée par le serveur autoritaire. Aucun roster ni seed ne transite ici. */
  roomId: string;
}

/**
 * Capacité maximale d'un hub / partie co-op à cette étape.
 *
 * La présence et les broadcasts Supabase étant pilotés uniquement par les clients,
 * cette limite est défendue au mieux avant l'entrée et avant le lancement, mais ne
 * constitue pas une garantie de sécurité face à un client modifié ou à deux arrivées
 * strictement concurrentes. Une admission atomique côté serveur serait nécessaire.
 */
export const HUB_CAPACITY = 10;
