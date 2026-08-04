import { randomUUID } from 'node:crypto';

import type { InternalTowerRoomOptions } from '../http/createRoom.js';

export interface TowerRoomCreationOptions {
  reservationTicket: string;
}

/**
 * Passage interne à usage unique entre l'endpoint authentifié et le matchmaker.
 * Un appel direct au endpoint de création Colyseus ne peut pas forger le roster ni les bonus.
 */
export class RoomReservationRegistry {
  private readonly reservations = new Map<string, InternalTowerRoomOptions>();

  public issue(options: InternalTowerRoomOptions): TowerRoomCreationOptions {
    const reservationTicket = randomUUID();
    this.reservations.set(reservationTicket, options);
    return { reservationTicket };
  }

  public consume(options: unknown, nowMs = Date.now()): InternalTowerRoomOptions | undefined {
    if (
      typeof options !== 'object' ||
      options === null ||
      !('reservationTicket' in options) ||
      typeof options.reservationTicket !== 'string'
    ) {
      return undefined;
    }
    const reservation = this.reservations.get(options.reservationTicket);
    this.reservations.delete(options.reservationTicket);
    if (reservation === undefined || reservation.expiresAtMs <= nowMs) return undefined;
    return reservation;
  }
}
