// Service « amis » : façade typée au-dessus des RPC Supabase du système d'amis
// (migration 0002_friends.sql). Ne gère PAS la présence — celle-ci provient de
// la couche temps réel. Toutes les données sont mappées snake_case → camelCase.

import { supabase } from '../account/supabaseClient.js';
import type { IncomingFriendRequest } from './types.js';

/** Données de base d'un ami (sans information de présence). */
export interface FriendBase {
  userId: string;
  displayName: string;
  friendCode: string;
}

export interface FriendsService {
  /** Code ami personnel du joueur connecté. */
  getMyFriendCode(): Promise<string>;
  /** Amis (sans présence — la présence vient de la couche temps réel). */
  listFriends(): Promise<FriendBase[]>;
  /** Demandes d'ami reçues, en attente de réponse. */
  listIncomingRequests(): Promise<IncomingFriendRequest[]>;
  /** Envoie une demande d'ami à partir d'un code ami. */
  sendFriendRequest(friendCode: string): Promise<void>;
  /** Accepte (true) ou refuse (false) une demande reçue. */
  respondFriendRequest(requestId: string, accept: boolean): Promise<void>;
  /** Supprime une amitié existante. */
  removeFriend(friendUserId: string): Promise<void>;
}

/** Ligne brute renvoyée par la RPC list_friends. */
interface FriendRow {
  user_id: string;
  display_name: string;
  friend_code: string;
}

/** Ligne brute renvoyée par la RPC list_incoming_requests. */
interface IncomingRequestRow {
  request_id: string;
  from_user: string;
  from_display_name: string;
  from_friend_code: string;
}

/** Compose une Error lisible en français, en conservant la cause éventuelle. */
function toError(message: string, cause: unknown): Error {
  if (cause instanceof Error) {
    return new Error(`${message} : ${cause.message}`);
  }
  return new Error(message);
}

class SupabaseFriendsService implements FriendsService {
  async getMyFriendCode(): Promise<string> {
    const { data, error } = await supabase.rpc('get_my_friend_code');
    if (error) {
      throw toError('Impossible de récupérer votre code ami', error);
    }
    if (typeof data !== 'string') {
      throw new Error('Code ami introuvable.');
    }
    return data;
  }

  async listFriends(): Promise<FriendBase[]> {
    const { data, error } = await supabase.rpc('list_friends');
    if (error) {
      throw toError("Impossible de charger votre liste d'amis", error);
    }
    const rows = (data ?? []) as FriendRow[];
    return rows.map((row) => ({
      userId: row.user_id,
      displayName: row.display_name,
      friendCode: row.friend_code,
    }));
  }

  async listIncomingRequests(): Promise<IncomingFriendRequest[]> {
    const { data, error } = await supabase.rpc('list_incoming_requests');
    if (error) {
      throw toError("Impossible de charger vos demandes d'amis", error);
    }
    const rows = (data ?? []) as IncomingRequestRow[];
    return rows.map((row) => ({
      requestId: row.request_id,
      fromUserId: row.from_user,
      fromDisplayName: row.from_display_name,
      fromFriendCode: row.from_friend_code,
    }));
  }

  async sendFriendRequest(friendCode: string): Promise<void> {
    const { error } = await supabase.rpc('send_friend_request', {
      p_friend_code: friendCode,
    });
    if (error) {
      throw toError("Échec de l'envoi de la demande d'ami", error);
    }
  }

  async respondFriendRequest(requestId: string, accept: boolean): Promise<void> {
    const { error } = await supabase.rpc('respond_friend_request', {
      p_request_id: requestId,
      p_accept: accept,
    });
    if (error) {
      throw toError("Échec de la réponse à la demande d'ami", error);
    }
  }

  async removeFriend(friendUserId: string): Promise<void> {
    const { error } = await supabase.rpc('remove_friend', {
      p_friend_id: friendUserId,
    });
    if (error) {
      throw toError("Échec de la suppression de l'ami", error);
    }
  }
}

export const friendsService: FriendsService = new SupabaseFriendsService();
