import { TowerSimulation } from '@village-survivor/game-core';
import type { TowerGameState, TowerInput, TowerSession } from '@village-survivor/protocol';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from '../account/supabaseClient.js';

// Netcode du NOUVEAU jeu (« Tower / arme à feu »), host-autoritaire — même principe
// que le co-op de l'ancien jeu (voir net/coopSession.ts), adapté au contrat Tower.
// L'état Tower ne contient aucune case de tableau vide (contrairement aux inventaires
// de l'ancien jeu), donc aucune normalisation `null → undefined` n'est nécessaire.

/** Doit correspondre au tickMs interne de TowerSimulation (tuning). */
const TOWER_TICK_MS = 50;
const STATE_BROADCAST_HZ = 20;
const INPUT_SEND_HZ = 30;
const STATE_INTERVAL_MS = 1_000 / STATE_BROADCAST_HZ;
const INPUT_INTERVAL_MS = 1_000 / INPUT_SEND_HZ;

/** Session Tower + fraction d'interpolation pour le rendu (voir TowerScene). */
export interface TowerRenderableSession extends TowerSession {
  getRenderAlpha(): number;
}

export interface TowerCoopConfig {
  seed: string;
  code: string;
  hostId: string;
  me: string;
  roster: readonly { id: string; name: string }[];
}

function idleInput(): TowerInput {
  return { sequence: 0, moveX: 0, moveY: 0, aimX: 1, aimY: 0 };
}

/** Part PERSISTANTE d'une commande (déplacement/visée/tir maintenu) — sans les actions
 * ponctuelles (choix d'amélioration, achat de tourelle) qui ne doivent pas se rejouer. */
function persistentInput(input: TowerInput): TowerInput {
  return {
    sequence: input.sequence,
    moveX: input.moveX,
    moveY: input.moveY,
    aimX: input.aimX,
    aimY: input.aimY,
    ...(input.fire === true ? { fire: true } : {}),
  };
}

function hasDiscreteAction(input: TowerInput): boolean {
  return input.selectUpgradeId !== undefined || input.turretShop !== undefined;
}

function isTowerGameState(value: unknown): value is TowerGameState {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as { players?: unknown }).players)
  );
}

interface InputMessage {
  id: string;
  input: TowerInput;
}

// ─── Solo ─────────────────────────────────────────────────────────────────────

export class TowerLocalSession implements TowerRenderableSession {
  private readonly simulation: TowerSimulation;
  private readonly listeners = new Set<(state: TowerGameState) => void>();
  private currentInput: TowerInput = idleInput();
  private running = false;
  private frameHandle: number | undefined;
  private lastTimestamp = 0;
  private accumulatorMs = 0;

  public constructor(options: { seed: string }) {
    this.simulation = new TowerSimulation(options.seed, { playerIds: ['player-1'] });
  }

  public async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.simulation.start();
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
  }

  public sendInput(input: TowerInput): void {
    this.currentInput = input;
  }

  public getRenderAlpha(): number {
    return Math.max(0, Math.min(1, this.accumulatorMs / TOWER_TICK_MS));
  }

  public subscribe(listener: (state: TowerGameState) => void): () => void {
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
    while (this.accumulatorMs >= TOWER_TICK_MS && processed < 240) {
      this.simulation.step({ 'player-1': this.currentInput });
      this.currentInput = persistentInput(this.currentInput);
      this.accumulatorMs -= TOWER_TICK_MS;
      processed += 1;
    }
    if (processed > 0) {
      const snapshot = this.simulation.createSnapshot();
      for (const listener of this.listeners) {
        listener(snapshot);
      }
    }
    this.frameHandle = requestAnimationFrame(this.onFrame);
  };
}

// ─── Hôte ───────────────────────────────────────────────────────────────────

class TowerHostSession implements TowerRenderableSession {
  private readonly simulation: TowerSimulation;
  private readonly channel: RealtimeChannel;
  private readonly me: string;
  private readonly listeners = new Set<(state: TowerGameState) => void>();
  private readonly inputsById: Record<string, TowerInput> = {};
  private running = false;
  private channelReady = false;
  private frameHandle: number | undefined;
  private lastTimestamp = 0;
  private accumulatorMs = 0;
  private lastBroadcastMs = 0;

  public constructor(config: TowerCoopConfig) {
    this.me = config.me;
    this.simulation = new TowerSimulation(config.seed, {
      playerIds: config.roster.map((entry) => entry.id),
    });
    this.channel = supabase.channel(`tower:${config.code}`, {
      config: { broadcast: { self: false } },
    });
    this.channel.on<InputMessage>('broadcast', { event: 'input' }, (message) => {
      const payload = message.payload;
      if (
        typeof payload?.id === 'string' &&
        payload.input !== undefined &&
        payload.id !== this.me
      ) {
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
    this.channel.subscribe((status: string) => {
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
      console.warn('[tower:host] removeChannel', error);
    }
  }

  public sendInput(input: TowerInput): void {
    this.inputsById[this.me] = input;
  }

  public getRenderAlpha(): number {
    return Math.max(0, Math.min(1, this.accumulatorMs / TOWER_TICK_MS));
  }

  public subscribe(listener: (state: TowerGameState) => void): () => void {
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
    while (this.accumulatorMs >= TOWER_TICK_MS && processed < 240) {
      this.simulation.step(this.inputsById);
      for (const id of Object.keys(this.inputsById)) {
        const current = this.inputsById[id];
        if (current !== undefined) {
          this.inputsById[id] = persistentInput(current);
        }
      }
      this.accumulatorMs -= TOWER_TICK_MS;
      processed += 1;
    }
    if (processed > 0) {
      const snapshot = this.simulation.createSnapshot();
      for (const listener of this.listeners) {
        listener(snapshot);
      }
      if (this.channelReady && timestamp - this.lastBroadcastMs >= STATE_INTERVAL_MS) {
        this.lastBroadcastMs = timestamp;
        void this.channel.send({ type: 'broadcast', event: 'state', payload: snapshot });
      }
    }
    this.frameHandle = requestAnimationFrame(this.onFrame);
  };
}

// ─── Invité ─────────────────────────────────────────────────────────────────

class TowerGuestSession implements TowerRenderableSession {
  private readonly channel: RealtimeChannel;
  private readonly me: string;
  private readonly listeners = new Set<(state: TowerGameState) => void>();
  private latestInput: TowerInput = idleInput();
  private lastState: TowerGameState | undefined;
  private lastStateAt = 0;
  private running = false;
  private sendHandle: number | undefined;

  public constructor(config: TowerCoopConfig) {
    this.me = config.me;
    this.channel = supabase.channel(`tower:${config.code}`, {
      config: { broadcast: { self: false } },
    });
    this.channel.on<TowerGameState>('broadcast', { event: 'state' }, (message) => {
      const payload = message.payload;
      if (!isTowerGameState(payload)) {
        return;
      }
      // Réexpose l'avatar local du point de vue de cet invité.
      const mine = payload.players.find((player) => player.id === this.me);
      const state: TowerGameState = mine === undefined ? payload : { ...payload, player: mine };
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
    this.channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        this.sendHandle = window.setInterval(() => this.flushInput(), INPUT_INTERVAL_MS);
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
      console.warn('[tower:guest] removeChannel', error);
    }
  }

  public sendInput(input: TowerInput): void {
    this.latestInput = input;
    // Les actions ponctuelles (amélioration, achat) partent immédiatement.
    if (hasDiscreteAction(input)) {
      this.flushInput();
    }
  }

  public getRenderAlpha(): number {
    if (this.lastStateAt === 0) {
      return 0;
    }
    return Math.max(0, Math.min(1, (performance.now() - this.lastStateAt) / STATE_INTERVAL_MS));
  }

  public subscribe(listener: (state: TowerGameState) => void): () => void {
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

/** Crée la session co-op Tower adaptée au rôle (hôte si `me === hostId`, sinon invité). */
export function createTowerCoopSession(config: TowerCoopConfig): TowerRenderableSession {
  const isHost = config.me === config.hostId;
  console.info(
    `[tower] rôle=${isHost ? 'HÔTE' : 'INVITÉ'} · canal=tower:${config.code} · moi=${config.me}`,
  );
  return isHost ? new TowerHostSession(config) : new TowerGuestSession(config);
}
