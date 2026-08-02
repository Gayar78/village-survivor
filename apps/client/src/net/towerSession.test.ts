import type { TowerInput } from '@village-survivor/protocol';
import { describe, expect, it } from 'vitest';

import {
  parseTowerInputBatch,
  electTowerCoordinator,
  TOWER_INPUT_BATCH_TICKS,
  TOWER_INPUT_DELAY_TICKS,
  TOWER_LOCKSTEP_EVENTS,
  towerFingerprintBroadcast,
  towerInputBatchBroadcast,
  towerReadyBroadcast,
  TowerFingerprintMonitor,
  TowerLockstepHistory,
  TowerLockstepInputBuffer,
  TowerReadyBarrier,
  TowerRejoinHistoryReceiver,
  TowerRosterController,
  towerLocalRenderLead,
  towerDueLocalTick,
  towerBuildMismatchMessage,
  TOWER_MAX_RENDER_LEAD_TICKS,
  type TowerRosterControlEvent,
  type TowerInputBatchMessage,
} from './towerSession.js';

const roster = new Set(['host', 'guest']);

function input(sequence: number, actionId?: string): TowerInput {
  return {
    sequence,
    moveX: 1,
    moveY: -1,
    aimX: 42,
    aimY: 0,
    fire: true,
    ...(actionId === undefined ? {} : { discreteActionId: actionId, selectUpgradeId: 'offer-1' }),
  };
}

function batch(senderId: string, ...ticks: number[]): TowerInputBatchMessage {
  return { senderId, frames: ticks.map((tick) => ({ tick, input: input(tick) })) };
}

describe('barrière de démarrage lockstep', () => {
  it('attend chaque membre unique du roster et ignore les inconnus', () => {
    const barrier = new TowerReadyBarrier(roster);

    expect(barrier.markLocalReady('host')).toBe(true);
    expect(barrier.complete).toBe(false);
    expect(barrier.missingIds).toEqual(['guest']);
    expect(barrier.accept({ senderId: 'outsider' })).toBe(false);
    expect(barrier.accept({ senderId: 'host' })).toBe(true);
    expect(barrier.complete).toBe(false);
    expect(barrier.accept({ senderId: 'guest' })).toBe(true);
    expect(barrier.complete).toBe(true);
  });
});

describe('frames d’entrée par tick', () => {
  it('ne simule pas lorsqu’une frame joueur manque', () => {
    const buffer = new TowerLockstepInputBuffer(roster);

    expect(buffer.acceptBatch(batch('host', 0))).toBe(1);
    expect(buffer.takeNextTick()).toBeNull();
    expect(buffer.nextTick).toBe(0);
  });

  it('récupère une frame Broadcast perdue grâce à la fenêtre du batch suivant', () => {
    const buffer = new TowerLockstepInputBuffer(roster);

    buffer.acceptBatch(batch('host', 0, 1));
    // Le premier paquet guest (qui contenait le tick 0) est perdu.
    buffer.acceptBatch(batch('guest', 1));
    expect(buffer.takeNextTick()).toBeNull();

    // Le paquet suivant répète la fenêtre récente, dont le tick 0 manquant.
    expect(buffer.acceptBatch(batch('guest', 0, 1))).toBe(1);
    expect(buffer.takeNextTick()).toEqual({ host: input(0), guest: input(0) });
    expect(buffer.takeNextTick()).toEqual({ host: input(1), guest: input(1) });
    expect(TOWER_INPUT_BATCH_TICKS).toBeGreaterThanOrEqual(8);
    expect(TOWER_INPUT_DELAY_TICKS).toBe(2);
  });

  it('accepte les nouvelles frames d’un batch qui répète aussi des ticks déjà joués', () => {
    const buffer = new TowerLockstepInputBuffer(roster);

    buffer.acceptBatch(batch('host', 0));
    buffer.acceptBatch(batch('guest', 0));
    expect(buffer.takeNextTick()).not.toBeNull();

    expect(buffer.acceptBatch(batch('host', 0, 1))).toBe(1);
    expect(buffer.acceptBatch(batch('guest', 0, 1))).toBe(1);
    expect(buffer.takeNextTick()).toEqual({ host: input(1), guest: input(1) });
  });

  it('déduplique une frame et n’applique son action discrète qu’une fois', () => {
    const buffer = new TowerLockstepInputBuffer(roster);
    const guestAction: TowerInputBatchMessage = {
      senderId: 'guest',
      frames: [{ tick: 0, input: input(10, 'action-10') }],
    };

    expect(buffer.acceptBatch(batch('host', 0))).toBe(1);
    expect(buffer.acceptBatch(guestAction)).toBe(1);
    expect(buffer.acceptBatch(guestAction)).toBe(0);
    expect(buffer.takeNextTick()?.guest).toMatchObject({
      discreteActionId: 'action-10',
      selectUpgradeId: 'offer-1',
    });
    expect(buffer.takeNextTick()).toBeNull();
  });

  it('rejette roster usurpé, tick hors bornes, input invalide et batch surdimensionné', () => {
    expect(parseTowerInputBatch(batch('outsider', 0), roster, 0, 10)).toBeNull();
    expect(parseTowerInputBatch(batch('guest', 11), roster, 0, 10)).toBeNull();
    expect(
      parseTowerInputBatch(
        {
          senderId: 'guest',
          frames: [{ tick: 0, input: { ...input(0), moveX: 2 } }],
        },
        roster,
        0,
        10,
      ),
    ).toBeNull();
    expect(
      parseTowerInputBatch(
        {
          senderId: 'guest',
          frames: Array.from({ length: 17 }, (_, tick) => ({ tick, input: input(tick) })),
        },
        roster,
        0,
        20,
      ),
    ).toBeNull();
  });
});

describe('roster lockstep dynamique', () => {
  const leave = (overrides: Partial<TowerRosterControlEvent> = {}): TowerRosterControlEvent => ({
    eventId: 'host:1:leave:guest',
    sequence: 1,
    tick: 2,
    action: 'leave',
    playerId: 'guest',
    coordinatorId: 'host',
    reason: 'peer-timeout',
    ...overrides,
  });

  it('continue sans frame du pair défaillant jusqu’à sa sortie planifiée', () => {
    const buffer = new TowerLockstepInputBuffer(roster);
    expect(buffer.scheduleRosterEvent(leave())).toBe(true);
    buffer.acceptBatch(batch('host', 0, 1, 2, 3));

    expect(buffer.takeNextTick()).toEqual({ host: input(0), guest: expect.any(Object) });
    expect(buffer.takeNextTick()).toEqual({ host: input(1), guest: expect.any(Object) });
    expect(buffer.takeNextTick()).toEqual({ host: input(2) });
    expect(buffer.takeAppliedRosterEvents()).toEqual([leave()]);
    expect(buffer.takeNextTick()).toEqual({ host: input(3) });
  });

  it('remplace un coordinateur périmé par son successeur déterministe', () => {
    const ids = new Set(['z-host', 'b-peer', 'a-peer']);
    const controller = new TowerRosterController(ids);
    expect(electTowerCoordinator(ids)).toBe('a-peer');

    const event = leave({
      eventId: 'a-peer:1:leave:a-peer',
      playerId: 'a-peer',
      coordinatorId: 'b-peer',
      reason: 'coordinator-timeout',
    });
    expect(controller.accept({ senderId: 'b-peer', event }, 0)).toMatchObject({
      status: 'accepted',
    });
    expect(controller.apply(event)).toBe(true);
    expect(controller.coordinatorId).toBe('b-peer');
    expect(
      controller.accept(
        {
          senderId: 'a-peer',
          event: leave({ eventId: 'stale', sequence: 2, coordinatorId: 'a-peer', tick: 3 }),
        },
        1,
      ),
    ).toEqual({ status: 'ignored' });
  });
});

describe('historique de reconnexion', () => {
  const historyRecord = (tick: number) => ({
    tick,
    inputs: { host: input(tick), guest: input(tick) },
    rosterEvents: [],
  });

  it('n’accepte que la cible, l’ordre et des records valides', () => {
    const receiver = new TowerRejoinHistoryReceiver('guest', 'request-1', 'guest', roster);
    const valid = {
      senderId: 'guest',
      targetId: 'guest',
      requestId: 'request-1',
      chunkIndex: 0,
      final: false,
      records: [historyRecord(0)],
    };
    expect(receiver.accept({ ...valid, targetId: 'other' })).toEqual({ status: 'ignored' });
    expect(receiver.accept({ ...valid, chunkIndex: 1 })).toEqual({ status: 'ignored' });
    expect(
      receiver.accept({
        ...valid,
        records: [{ ...historyRecord(0), inputs: { host: input(0) } }],
      }),
    ).toEqual({ status: 'ignored' });
    expect(receiver.accept(valid)).toEqual({ status: 'accepted' });
    expect(
      receiver.accept({ ...valid, chunkIndex: 1, final: true, records: [historyRecord(1)] }),
    ).toMatchObject({ status: 'complete' });
  });

  it('borne les chunks et refuse un paquet surdimensionné', () => {
    const history = new TowerLockstepHistory();
    for (let tick = 0; tick < 40; tick += 1) history.append(historyRecord(tick));
    const chunks = history.chunksFor(
      { senderId: 'guest', targetId: 'guest', requestId: 'request-2', fromTick: 0 },
      'host',
    );
    expect(chunks).not.toBeNull();
    expect(chunks!.length).toBeGreaterThan(1);
    expect(chunks!.every((chunk) => chunk.records.length <= 24)).toBe(true);

    const receiver = new TowerRejoinHistoryReceiver('guest', 'request-2', 'host', roster);
    expect(
      receiver.accept({
        senderId: 'host',
        targetId: 'guest',
        requestId: 'request-2',
        chunkIndex: 0,
        final: true,
        records: [],
        padding: 'x'.repeat(20_000),
      }),
    ).toEqual({ status: 'ignored' });
  });
});

describe('protocole Broadcast minimal', () => {
  it('n’émet que ready, input-batch et fingerprint, jamais un état de jeu', () => {
    const packets = [
      towerReadyBroadcast('host'),
      towerInputBatchBroadcast(batch('host', 0)),
      towerFingerprintBroadcast({ senderId: 'host', tick: 20, fingerprint: 'abc' }),
    ];

    expect(packets.map((packet) => packet.event)).toEqual([
      TOWER_LOCKSTEP_EVENTS.ready,
      TOWER_LOCKSTEP_EVENTS.inputBatch,
      TOWER_LOCKSTEP_EVENTS.fingerprint,
    ]);
    expect(packets.some((packet) => packet.event === ('state' as never))).toBe(false);
    expect(JSON.stringify(packets)).not.toContain('monsters');
    expect(JSON.stringify(packets)).not.toContain('projectiles');
  });
});

describe('empreintes d’intégrité', () => {
  it('détecte clairement un mismatch, y compris si l’empreinte distante arrive avant la locale', () => {
    const monitor = new TowerFingerprintMonitor(roster, 'host');

    expect(monitor.accept({ senderId: 'guest', tick: 20, fingerprint: 'remote-hash' })).toEqual({
      status: 'pending',
    });
    expect(monitor.recordLocal(20, 'local-hash')).toContainEqual({
      status: 'mismatch',
      playerId: 'guest',
      tick: 20,
    });
  });

  it('accepte une empreinte identique et ignore les expéditeurs hors roster', () => {
    const monitor = new TowerFingerprintMonitor(roster, 'host');

    expect(monitor.recordLocal(40, 'same-hash')).toEqual([]);
    expect(monitor.accept({ senderId: 'guest', tick: 40, fingerprint: 'same-hash' })).toEqual({
      status: 'match',
    });
    expect(monitor.accept({ senderId: 'outsider', tick: 40, fingerprint: 'evil' })).toEqual({
      status: 'ignored',
    });
  });
});

describe('horloge de capture des entrées', () => {
  it('déduit le tick dû du temps réel, jamais d’un compte de déclenchements', () => {
    // C'est toute la correction du 2 août 2026 : une horloge qui rattrape ce qu'elle a manqué.
    expect(towerDueLocalTick(3, 0)).toBe(3);
    expect(towerDueLocalTick(3, 49)).toBe(3);
    expect(towerDueLocalTick(3, 50)).toBe(4);
    expect(towerDueLocalTick(3, 1_000)).toBe(23);
  });

  it('rattrape une interruption au lieu de perdre les ticks', () => {
    // Un onglet bloqué 500 ms doit produire les dix entrées manquantes d'un coup. L'ancienne
    // capture, à un tick par déclenchement de minuteur, les perdait définitivement — et la
    // partie prenait 11 secondes de retard en deux minutes et demie.
    const avant = towerDueLocalTick(100, 5_000);
    const apres = towerDueLocalTick(100, 5_500);

    expect(apres - avant).toBe(10);
  });

  it('ne réclame jamais un tick antérieur à son origine', () => {
    // `performance.now()` peut reculer d'une fraction de milliseconde entre deux lectures.
    expect(towerDueLocalTick(42, -12)).toBe(42);
  });
});

describe('contrôle de construction entre pairs', () => {
  it('signale deux constructions différentes', () => {
    // Le 2 août 2026, deux postes ont joué une build périmée servie par leur cache pendant
    // qu'une build corrigée était déployée. Aucun signal ne l'a dit, et la session de test a
    // mesuré autre chose que ce qu'elle croyait mesurer.
    const message = towerBuildMismatchMessage('mfhk2z8', 'mfhk9qa');

    expect(message).not.toBeNull();
    expect(message).toContain('Ctrl+Maj+R');
  });

  it('ne dit rien quand les constructions concordent', () => {
    expect(towerBuildMismatchMessage('mfhk2z8', 'mfhk2z8')).toBeNull();
  });

  it('reste muet devant un pair qui n’annonce pas sa construction', () => {
    // Compatibilité avec une version antérieure au contrôle : mieux vaut ne rien dire qu'alerter
    // à tort et apprendre aux joueurs à ignorer le bandeau.
    expect(towerBuildMismatchMessage(undefined, 'mfhk2z8')).toBeNull();
    expect(towerBuildMismatchMessage('', 'mfhk2z8')).toBeNull();
    expect(towerBuildMismatchMessage(42, 'mfhk2z8')).toBeNull();
  });
});

describe('avance de rendu de l’avatar local', () => {
  it('vaut l’âge de la dernière entrée émise en marche normale', () => {
    // Trois entrées capturées d'avance : celle qui vient d'être prise (indice 102) puis les deux
    // que le lockstep garde en file. L'avance croît du tick que dure leur capture.
    expect(towerLocalRenderLead(100, 103, 0)).toBe(2);
    expect(towerLocalRenderLead(100, 103, 0.5)).toBe(2.5);
    expect(towerLocalRenderLead(100, 103, 1)).toBe(3);
  });

  it('ne recule jamais quand une entrée est capturée', () => {
    // Instant de la capture : le compteur avance d'un tick et la fraction repart de zéro. Un
    // avatar qui sauterait en arrière à cet instant, vingt fois par seconde, serait injouable.
    expect(towerLocalRenderLead(100, 104, 0)).toBe(towerLocalRenderLead(100, 103, 1));
  });

  it('plafonne l’avance quand la simulation attend un pair', () => {
    // Le tick simulé est bloqué à 100 pendant que la capture locale continue : sans plafond,
    // l'avatar s'éloignerait indéfiniment du monde dessiné autour de lui.
    expect(towerLocalRenderLead(100, 160, 0.5)).toBe(TOWER_MAX_RENDER_LEAD_TICKS);
  });

  it('ne rend aucune avance tant qu’aucune entrée n’est en file', () => {
    expect(towerLocalRenderLead(100, 100, 0)).toBe(0);
    expect(towerLocalRenderLead(100, 101, 0)).toBe(0);
  });

  it('borne une fraction de capture aberrante', () => {
    // `performance.now()` peut sauter (onglet mis en veille) : la fraction ne doit pas faire
    // consommer une entrée qui n'existe pas encore.
    expect(towerLocalRenderLead(100, 103, 12)).toBe(3);
    expect(towerLocalRenderLead(100, 103, -4)).toBe(2);
  });
});
