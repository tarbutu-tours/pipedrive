/**
 * Validation rules before creating TravelBooster booking.
 * All must be true to call TravelBooster.
 */

import type { DealPayload, PassengerPayload, TravelFileApprovalStatus } from './types';

export interface ValidationResult {
  valid: boolean;
  missingFields: string[];
}

const APPROVED: TravelFileApprovalStatus = 'Approved';

/**
 * Before creating in TravelBooster, ALL must be true:
 * - Deal status == "won"
 * - TravelFile Approval Status == "Approved"
 * - Selected Tour Code present
 * - Departure Date present
 * - Variant present
 * - At least 1 Participant
 * - Every Participant: ID/Passport and Date of Birth present
 * - Total Price present
 * - TravelFile Number is empty (idempotency)
 */
export function validateForTravelBoosterCreate(
  deal: DealPayload,
  passengers: PassengerPayload[]
): ValidationResult {
  const missing: string[] = [];

  if (deal.status !== 'won') {
    missing.push('Deal status must be won');
  }
  if (deal.travelFileApprovalStatus !== APPROVED) {
    missing.push('TravelFile Approval Status must be Approved');
  }
  if (!deal.selectedTourCode?.trim()) {
    missing.push('Selected Tour Code');
  }
  if (!deal.departureDate?.trim()) {
    missing.push('Departure Date');
  }
  if (!deal.variant?.trim()) {
    missing.push('Variant');
  }
  if (deal.totalPrice == null || deal.totalPrice === undefined || Number.isNaN(Number(deal.totalPrice))) {
    missing.push('Total Price');
  }
  if (deal.travelFileNumber?.trim()) {
    missing.push('TravelFile Number must be empty (idempotency)');
  }
  if (deal.travelBoosterBookingId?.trim()) {
    missing.push('TravelBooster Booking ID must be empty (idempotency)');
  }

  if (passengers.length === 0) {
    missing.push('At least one Participant (passenger)');
  }
  passengers.forEach((p, i) => {
    if (!p.idPassport?.trim()) {
      missing.push(`Participant ${i + 1}: ID/Passport`);
    }
    if (!p.dateOfBirth?.trim()) {
      missing.push(`Participant ${i + 1}: Date of Birth`);
    }
  });

  return {
    valid: missing.length === 0,
    missingFields: missing,
  };
}

/**
 * Check if we should skip TB creation (idempotency).
 * If TravelFile Number OR TravelBooster Booking ID already exists → do nothing.
 */
export function shouldSkipCreateDueToIdempotency(deal: DealPayload): boolean {
  return !!(deal.travelFileNumber?.trim() || deal.travelBoosterBookingId?.trim());
}
