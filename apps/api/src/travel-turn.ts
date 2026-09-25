import type { BoardEffect } from '../../../packages/game-core/src/board-definition.ts';

type DestinationEffect = Extract<BoardEffect, { type: 'choose_destination' }>;
export type TravelReservation = DestinationEffect & {
  selectedCellId: string | null;
  reservedTurnCommandId: string | null;
  cancelled: boolean;
};
export type TravelDecision =
  | { type: 'wait'; reservation: TravelReservation }
  | { type: 'move'; reservation: TravelReservation; cellId: string; turnCommandId: string }
  | { type: 'return_turn'; reservation: TravelReservation; turnCommandId: string }
  | { type: 'cancel'; reservation: TravelReservation };

/** A preselection waits for a normal turn unless the operator explicitly requests immediate travel. */
export function decideTravel(reservation: TravelReservation, paused: boolean): TravelDecision {
  if (reservation.cancelled) {
    if (!reservation.reservedTurnCommandId) return { type: 'cancel', reservation };
    return paused ? { type: 'wait', reservation } : { type: 'return_turn', reservation, turnCommandId: reservation.reservedTurnCommandId };
  }
  if (!reservation.reservedTurnCommandId || !reservation.selectedCellId || paused) return { type: 'wait', reservation };
  return { type: 'move', reservation, cellId: reservation.selectedCellId, turnCommandId: reservation.reservedTurnCommandId };
}

export function reserveTravelTurn(reservation: TravelReservation, commandId: string): TravelDecision {
  if (reservation.reservedTurnCommandId) throw new Error('A turn is already waiting for its destination');
  // An explicit one-step roll is allowed while paused, just like ordinary manual rolls.
  return decideTravel({ ...reservation, reservedTurnCommandId: commandId }, false);
}

/** An explicit move consumes this command's turn, or the turn already reserved for the trip. */
export function moveTravelNow(reservation: TravelReservation, commandId: string): TravelDecision {
  return reservation.reservedTurnCommandId
    ? decideTravel(reservation, false)
    : reserveTravelTurn(reservation, commandId);
}
