/**
 * Acceptance tests for validation and idempotency logic.
 */

import {
  validateForTravelBoosterCreate,
  shouldSkipCreateDueToIdempotency,
} from '../src/domain/validation';
import type { DealPayload, PassengerPayload } from '../src/domain/types';

function deal(overrides: Partial<DealPayload> = {}): DealPayload {
  return {
    dealId: 1,
    status: 'won',
    ownerId: 100,
    selectedTourCode: 'TOUR-01',
    departureDate: '2025-06-15',
    variant: 'Upper Deck',
    totalPrice: 1500,
    currency: 'USD',
    travelFileApprovalStatus: 'Approved',
    travelFileSystemStatus: 'Not Sent',
    travelBoosterBookingId: null,
    travelFileNumber: null,
    travelBoosterErrorMessage: null,
    ...overrides,
  };
}

function passenger(overrides: Partial<PassengerPayload> = {}): PassengerPayload {
  return {
    personId: 1,
    firstName: 'Jane',
    lastName: 'Doe',
    idPassport: 'P123456',
    dateOfBirth: '1990-01-01',
    ...overrides,
  };
}

describe('validateForTravelBoosterCreate', () => {
  test('1) Deal becomes WON → no TB calls; approval Pending; create approval Activity (handled in orchestrator)', () => {
    const d = deal({ status: 'won', travelFileApprovalStatus: null });
    const result = validateForTravelBoosterCreate(d, [passenger()]);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('TravelFile Approval Status must be Approved');
  });

  test('2) Deal WON + Approved + all required fields present → valid', () => {
    const result = validateForTravelBoosterCreate(deal(), [passenger()]);
    expect(result.valid).toBe(true);
    expect(result.missingFields).toHaveLength(0);
  });

  test('3) Idempotency: TravelFile Number already set → should skip', () => {
    const d = deal({ travelFileNumber: 'TF-123' });
    expect(shouldSkipCreateDueToIdempotency(d)).toBe(true);
  });

  test('3) Idempotency: Booking ID already set → should skip', () => {
    const d = deal({ travelBoosterBookingId: 'TB-456' });
    expect(shouldSkipCreateDueToIdempotency(d)).toBe(true);
  });

  test('4) Approved but missing required deal/person fields → invalid; status Failed + error; no TB call', () => {
    const d = deal({ selectedTourCode: null });
    const result = validateForTravelBoosterCreate(d, [passenger()]);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('Selected Tour Code');
  });

  test('4) Missing passenger ID/Passport', () => {
    const result = validateForTravelBoosterCreate(deal(), [
      passenger({ idPassport: null }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.missingFields.some((f) => f.includes('ID/Passport'))).toBe(true);
  });

  test('4) Missing passenger Date of Birth', () => {
    const result = validateForTravelBoosterCreate(deal(), [
      passenger({ dateOfBirth: null }),
    ]);
    expect(result.valid).toBe(false);
    expect(result.missingFields.some((f) => f.includes('Date of Birth'))).toBe(true);
  });

  test('4) No participants', () => {
    const result = validateForTravelBoosterCreate(deal(), []);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('At least one Participant (passenger)');
  });

  test('5) Cancelled → no TB call (orchestrator returns early)', () => {
    const d = deal({ travelFileApprovalStatus: 'Cancelled' });
    const result = validateForTravelBoosterCreate(d, [passenger()]);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain('TravelFile Approval Status must be Approved');
  });
});
