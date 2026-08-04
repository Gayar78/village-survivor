import { trace } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-web';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { endGameSessionSpan, startGameChildSpan, startGameSessionSpan } from './gameTelemetry.js';
import { activeTraceIds } from './telemetry.js';

/**
 * Preuve, et non promesse : on émet réellement des spans dans un exportateur en mémoire, puis on
 * inspecte ce qui en sort.
 *
 * Deux exigences de la stratégie de tests sont vérifiées ici, et toutes deux bloquent la
 * release : une partie produit une trace exploitable, et **aucune donnée interdite** ne s'y
 * trouve. La seconde échoue à la moindre adresse e-mail, pseudonyme, jeton ou code de salon en
 * clair.
 */
describe('contrat de trace d’une partie', () => {
  // Exportateur recréé à chaque test : `provider.shutdown()` arrête aussi le sien, et un
  // exportateur arrêté ignore silencieusement tout ce qu'on lui envoie ensuite.
  let exporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;

  beforeEach(() => {
    exporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    trace.setGlobalTracerProvider(provider);
  });

  afterEach(async () => {
    await provider.shutdown();
    trace.disable();
  });

  function emitCoopSession(): ReadableSpan {
    const span = startGameSessionSpan({
      mode: 'coop',
      playersCount: 3,
    });
    endGameSessionSpan(span, 'defeat', { 'vs.wave': 12 });
    const emitted = exporter.getFinishedSpans().at(-1);
    expect(emitted).toBeDefined();
    return emitted!;
  }

  it('produit un span racine identifiable et terminé', () => {
    const span = emitCoopSession();

    expect(span.name).toBe('game.client.session');
    expect(span.spanContext().traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(span.attributes['vs.mode']).toBe('coop');
    expect(span.attributes['vs.players.count']).toBe(3);
    expect(span.attributes['vs.outcome']).toBe('defeat');
  });

  it('porte le service, sa version et son environnement', () => {
    const span = emitCoopSession();

    expect(span.attributes['service.version']).toBeDefined();
    expect(span.attributes['deployment.environment.name']).toBeDefined();
  });

  it('n’émet aucune donnée interdite', () => {
    const serialized = JSON.stringify(emitCoopSession().attributes);

    // Le code de salon ouvre le canal temps réel, où l'identité est déclarative : le publier
    // reviendrait à distribuer une clé d'entrée.
    expect(serialized).not.toContain('TOWER7');
    expect(serialized).not.toContain('graine-de-test');
    for (const forbidden of ['@', 'password', 'token', 'secret', 'account_id', 'player.id']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('marque en erreur une partie interrompue par une exception', () => {
    const span = startGameSessionSpan({ mode: 'solo', playersCount: 1 });
    endGameSessionSpan(span, 'error');
    const emitted = exporter.getFinishedSpans().at(-1);

    // Statut 2 = ERROR : c'est ce qui fait ressortir la partie fautive dans une liste de traces.
    expect(emitted?.status.code).toBe(2);
  });

  it('rattache les frontières de la partie à sa trace', () => {
    // Gate de la méthode : « trace racine → spans enfants → logs corrélés ». Le 2 août 2026, les
    // spans existaient mais formaient chacun leur propre trace, faute de contexte parent : on ne
    // pouvait donc pas dérouler une partie vers ses frontières, ce qui était tout l'objet.
    const session = startGameSessionSpan({ mode: 'coop', playersCount: 2 });
    const child = startGameChildSpan('coop.channel.join');
    child.end();
    endGameSessionSpan(session, 'defeat');

    const spans = exporter.getFinishedSpans();
    const emittedChild = spans.find((span) => span.name === 'coop.channel.join');
    const emittedSession = spans.find((span) => span.name === 'game.client.session');

    expect(emittedChild?.spanContext().traceId).toBe(emittedSession?.spanContext().traceId);
    expect(emittedChild?.parentSpanContext?.spanId).toBe(emittedSession?.spanContext().spanId);
  });

  it('corrèle les journaux à la partie en cours', () => {
    // Un navigateur ne propage pas de contexte à travers minuteurs et promesses : sans point
    // d'ancrage explicite, les enregistrements partaient sans identifiant de corrélation.
    const session = startGameSessionSpan({ mode: 'solo', playersCount: 1 });

    const pendant = activeTraceIds();
    endGameSessionSpan(session, 'left');
    const apres = activeTraceIds();

    expect(pendant?.trace_id).toBe(session.spanContext().traceId);
    expect(apres).toBeUndefined();
  });

  it('n’émet aucun code de salon pour une partie solo', () => {
    const span = startGameSessionSpan({ mode: 'solo', playersCount: 1 });
    endGameSessionSpan(span, 'left');

    expect(exporter.getFinishedSpans().at(-1)?.attributes['vs.room.code.hash']).toBeUndefined();
  });
});
