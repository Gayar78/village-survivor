import { defaultContent } from '@village-survivor/content';
import { GameSimulation } from '@village-survivor/game-core';
import type { PlayerInput, PublicGameState } from '@village-survivor/protocol';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '../account/supabaseClient.js';
import type { RenderableSession } from '../session/RenderableSession.js';

// Netcode co-op « hôte autoritaire ».
//
// - L'HÔTE (le chef) fait tourner l'UNIQUE simulation, avec un avatar par membre.
//   Il collecte les commandes des invités reçues sur le canal `game:<code>`, avance
//   la simulation, puis rediffuse l'état complet ~20 fois/s. Il rend sa propre partie
//   localement, sans latence.
// - Un INVITÉ ne simule rien : il envoie sa commande à l'hôte ~30 fois/s et affiche
//   le dernier état reçu, en réexposant SON avatar via `state.player`.
//
// Choix MVP assumés : diffusion best-effort (pas d'accusé de réception ni de
// prédiction côté invité — une légère latence est visible pour les invités) ; roster
// figé au lancement ; état complet à chaque diffusion (simple et robuste, coût réseau
// modéré pour ≤ 10 joueurs). Prédiction/interpolation avancée et reconnexion sont des
// améliorations ultérieures.

export interface CoopRosterEntry {
  id: string;
  name: string;
}

export interface CoopConfig {
  seed: string;
  /** Topic du canal de jeu partagé (`game:<code>`). */
  code: string;
  /** userId de l'hôte. */
  hostId: string;
  /** userId du joueur local. */
  me: string;
  /** Roster ordonné (hôte en premier). */
  roster: readonly CoopRosterEntry[];
}

/** Fréquence de diffusion de l'état par l'hôte (Hz). */
const STATE_BROADCAST_HZ = 20;
/** Fréquence d'émission des commandes par un invité (Hz). */
const INPUT_SEND_HZ = 30;

const STATE_INTERVAL_MS = 1_000 / STATE_BROADCAST_HZ;
const INPUT_INTERVAL_MS = 1_000 / INPUT_SEND_HZ;

function idleInput(): PlayerInput {
  return { sequence: 0, moveX: 0, moveY: 0 };
}

/**
 * Réduit une commande à sa part PERSISTANTE (déplacement/visée) : les actions
 * ponctuelles (compétences, sélection d'amélioration, dépôt…) ne doivent pas se
 * rejouer tick après tick si aucune nouvelle commande n'arrive.
 */
function persistentInput(input: PlayerInput): PlayerInput {
  return {
    sequence: input.sequence,
    moveX: input.moveX,
    moveY: input.moveY,
    ...(input.aimX === undefined ? {} : { aimX: input.aimX }),
    ...(input.aimY === undefined ? {} : { aimY: input.aimY }),
  };
}

/** Garde de robustesse : un payload d'état réseau doit au moins ressembler à un état. */
function isPublicGameState(value: unknown): value is PublicGameState {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { players?: unknown }).players)
  );
}

interface InputMessage {
  id: string;
  input: PlayerInput;
}

/**
 * Session HÔTE : simulation locale + diffusion de l'état. Implémente `RenderableSession`
 * pour être utilisée telle quelle par `GameScene`/`play.ts`, comme `LocalSession`.
 */
class HostSession implements RenderableSession {
  private readonly simulation: GameSimulation;
  private readonly channel: RealtimeChannel;
  private readonly me: string;
  private readonly tickMs: number;
  private readonly listeners = new Set<(state: PublicGameState) => void>();
  private readonly inputsById: Record<string, PlayerInput> = {};
  private running = false;
  private channelReady = false;
  private frameHandle: number | undefined;
  private lastTimestamp = 0;
  private accumulatorMs = 0;
  private lastBroadcastMs = 0;

  private readonly topic: string;
  private readonly seenInputIds = new Set<string>();
  private broadcastCount = 0;
  private lastLogMs = 0;

  public constructor(config: CoopConfig) {
    this.me = config.me;
    this.topic = `game:${config.code}`;
    this.simulation = new GameSimulation(defaultContent, config.seed, {
      playerIds: config.roster.map((entry) => entry.id),
    });
    this.tickMs = defaultContent.simulation.tickMs;
    this.channel = supabase.channel(this.topic, {
      config: { broadcast: { self: false } },
    });
    this.channel.on<InputMessage>('broadcast', { event: 'input' }, (message) => {
      const payload = message.payload;
      if (
        typeof payload?.id === 'string' &&
        payload.input !== undefined &&
        payload.id !== this.me
      ) {
        if (!this.seenInputIds.has(payload.id)) {
          this.seenInputIds.add(payload.id);
          console.info(`[coop:host] première commande reçue de ${payload.id}`);
        }
        this.inputsById[payload.id] = payload.input;
      }
    });
  }

  public async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.simulation.start();
    console.info(`[coop:host] abonnement au canal « ${this.topic} »…`);
    this.channel.subscribe((status: string, err?: Error) => {
      console.info(`[coop:host] canal « ${this.topic} » : ${status}`, err ?? '');
      if (status === 'SUBSCRIBED') {
        this.channelReady = true;
      }
    });
    this.lastTimestamp = performance.now();
    this.frameHandle = requestAnimationFrame(this.onFrame);
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.frameHandle !== undefined) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = undefined;
    }
    this.listeners.clear();
    try {
      await supabase.removeChannel(this.channel);
    } catch (error) {
      console.warn('[coop:host] removeChannel', error);
    }
  }

  public sendInput(input: PlayerInput): void {
    this.inputsById[this.me] = input;
  }

  public getRenderAlpha(): number {
    return Math.max(0, Math.min(1, this.accumulatorMs / this.tickMs));
  }

  public subscribe(listener: (state: PublicGameState) => void): () => void {
    this.listeners.add(listener);
    listener(this.simulation.createSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private readonly onFrame = (timestamp: number): void => {
    if (!this.running) {
      return;
    }
    const rawDeltaMs = Math.max(0, Math.min(250, timestamp - this.lastTimestamp));
    this.lastTimestamp = timestamp;
    this.accumulatorMs += rawDeltaMs;
    let processed = 0;
    while (this.accumulatorMs >= this.tickMs && processed < 240) {
      this.simulation.stepMulti(this.inputsById);
      // Les actions ponctuelles ne se rejouent pas au tick suivant.
      for (const id of Object.keys(this.inputsById)) {
        const current = this.inputsById[id];
        if (current !== undefined) {
          this.inputsById[id] = persistentInput(current);
        }
      }
      this.accumulatorMs -= this.tickMs;
      processed += 1;
    }
    if (processed > 0) {
      const snapshot = this.simulation.createSnapshot();
      for (const listener of this.listeners) {
        listener(snapshot);
      }
      if (this.channelReady && timestamp - this.lastBroadcastMs >= STATE_INTERVAL_MS) {
        this.lastBroadcastMs = timestamp;
        this.broadcastCount += 1;
        void this.channel
          .send({ type: 'broadcast', event: 'state', payload: snapshot })
          .then((res) => {
            if (res !== 'ok') {
              console.warn(`[coop:host] échec d'envoi d'état : ${String(res)}`);
            }
          });
        // Journal périodique (toutes les ~2 s) : nombre d'états diffusés + taille.
        if (timestamp - this.lastLogMs >= 2_000) {
          this.lastLogMs = timestamp;
          const bytes = JSON.stringify(snapshot).length;
          console.info(
            `[coop:host] ${this.broadcastCount} états diffusés (prêt=${String(this.channelReady)}, ~${bytes} o/état, invités vus=${this.seenInputIds.size})`,
          );
        }
      }
    }
    this.frameHandle = requestAnimationFrame(this.onFrame);
  };
}

/**
 * Session INVITÉ : aucune simulation. Envoie ses commandes à l'hôte et affiche le
 * dernier état reçu, en réexposant l'avatar local via `state.player`.
 */
class GuestSession implements RenderableSession {
  private readonly channel: RealtimeChannel;
  private readonly me: string;
  private readonly listeners = new Set<(state: PublicGameState) => void>();
  private latestInput: PlayerInput = idleInput();
  private lastState: PublicGameState | undefined;
  private lastStateAt = 0;
  private running = false;
  private sendHandle: number | undefined;

  private readonly topic: string;
  private stateCount = 0;

  public constructor(config: CoopConfig) {
    this.me = config.me;
    this.topic = `game:${config.code}`;
    this.channel = supabase.channel(this.topic, {
      config: { broadcast: { self: false } },
    });
    this.channel.on<PublicGameState>('broadcast', { event: 'state' }, (message) => {
      const payload = message.payload;
      if (!isPublicGameState(payload)) {
        console.warn('[coop:guest] état reçu mais malformé, ignoré');
        return;
      }
      this.stateCount += 1;
      if (this.stateCount === 1) {
        console.info('[coop:guest] premier état reçu de l’hôte ✔');
      }
      // Réexpose l'avatar local du point de vue de cet invité.
      const mine = payload.players.find((player) => player.id === this.me);
      if (this.stateCount === 1 && mine === undefined) {
        console.warn(
          `[coop:guest] mon avatar « ${this.me} » est absent du roster reçu`,
          payload.players.map((p) => p.id),
        );
      }
      const state: PublicGameState = mine === undefined ? payload : { ...payload, player: mine };
      this.lastState = state;
      this.lastStateAt = performance.now();
      for (const listener of this.listeners) {
        listener(state);
      }
    });
  }

  public async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    console.info(`[coop:guest] abonnement au canal « ${this.topic} » (moi=${this.me})…`);
    this.channel.subscribe((status: string, err?: Error) => {
      console.info(`[coop:guest] canal « ${this.topic} » : ${status}`, err ?? '');
      if (status === 'SUBSCRIBED') {
        this.sendHandle = window.setInterval(() => this.flushInput(), INPUT_INTERVAL_MS);
        // Avertissement si aucun état n'arrive dans les 5 s (hôte injoignable ?).
        window.setTimeout(() => {
          if (this.stateCount === 0) {
            console.warn(
              `[coop:guest] aucun état reçu après 5 s sur « ${this.topic} » — l'hôte diffuse-t-il ? même code ?`,
            );
          }
        }, 5_000);
      }
    });
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.sendHandle !== undefined) {
      clearInterval(this.sendHandle);
      this.sendHandle = undefined;
    }
    this.listeners.clear();
    try {
      await supabase.removeChannel(this.channel);
    } catch (error) {
      console.warn('[coop:guest] removeChannel', error);
    }
  }

  public sendInput(input: PlayerInput): void {
    this.latestInput = input;
  }

  public getRenderAlpha(): number {
    if (this.lastStateAt === 0) {
      return 0;
    }
    return Math.max(0, Math.min(1, (performance.now() - this.lastStateAt) / STATE_INTERVAL_MS));
  }

  public subscribe(listener: (state: PublicGameState) => void): () => void {
    this.listeners.add(listener);
    if (this.lastState !== undefined) {
      listener(this.lastState);
    }
    return () => {
      this.listeners.delete(listener);
    };
  }

  private flushInput(): void {
    const message: InputMessage = { id: this.me, input: this.latestInput };
    void this.channel.send({ type: 'broadcast', event: 'input', payload: message });
  }
}

/**
 * Crée la session co-op adaptée au rôle : hôte (le chef, `me === hostId`) ou invité.
 */
export function createCoopSession(config: CoopConfig): RenderableSession {
  const isHost = config.me === config.hostId;
  console.info(
    `[coop] rôle=${isHost ? 'HÔTE' : 'INVITÉ'} · canal=game:${config.code} · moi=${config.me} · hôte=${config.hostId} · roster=${config.roster.map((entry) => entry.id).join(',')}`,
  );
  return isHost ? new HostSession(config) : new GuestSession(config);
}
