/**
 * Orchestrator: Deal WON → approval gate → create TravelBooster booking when Approved + valid.
 * No automatic TB open on WON; human must set Approval to Approved.
 */

import * as pipedrive from './pipedriveClient';
import * as travelbooster from './travelboosterClient';
import { validateForTravelBoosterCreate, shouldSkipCreateDueToIdempotency } from '../domain/validation';
import { appendAudit, hasAnyCreateForDeal } from './../store/auditLog';
import type { TBCreatePaxFileRequest } from '../domain/types';

const FIELD_KEYS = {
  travelfile_approval_status: 'travelfile_approval_status',
  travelfile_system_status: 'travelfile_system_status',
  travelbooster_booking_id: 'travelbooster_booking_id',
  travelfile_number: 'travelfile_number',
  travelbooster_error_message: 'travelbooster_error_message',
} as const;

/**
 * Run orchestrator for a deal (after webhook or manual trigger).
 * 1) Deal WON → set approval Pending if missing, create approval Activity.
 * 2) Deal WON + Approved + valid + no existing TravelFile → create TB booking, write back.
 * 3) Idempotency: if TravelFile Number or Booking ID already set → skip.
 * 4) Validation failure → Failed status, error message, Activity; no TB call.
 */
export async function runForDeal(dealId: number): Promise<void> {
  const deal = await pipedrive.getDeal(dealId);
  if (!deal) return;

  const passengers = await pipedrive.listDealParticipantsOrPersons(dealId);

  // --- Deal won: ensure Pending if missing, then notify owner (only when we set Pending) ---
  if (deal.status === 'won') {
    const approval = deal.travelFileApprovalStatus?.trim() || null;
    const needsPending = approval !== 'Pending' && approval !== 'Approved' && approval !== 'Cancelled';
    if (needsPending) {
      await pipedrive.updateDeal(dealId, {
        [FIELD_KEYS.travelfile_approval_status]: 'Pending',
      });
      const approvalNote = [
        'Please approve this TravelFile for TravelBooster.',
        `Tour Code: ${deal.selectedTourCode ?? '—'}`,
        `Departure Date: ${deal.departureDate ?? '—'}`,
        `Variant: ${deal.variant ?? '—'}`,
        `Passenger count: ${passengers.length}`,
      ].join('\n');
      await pipedrive.createActivity(
        dealId,
        deal.ownerId,
        'Approve TravelBooster TravelFile',
        approvalNote
      );
    }
  }

  // --- Cancelled: no TB call, optional note ---
  if (deal.travelFileApprovalStatus === 'Cancelled') {
    // Optionally add activity; for MVP we skip TB only
    return;
  }

  // --- Only create in TB when: WON + Approved + valid + idempotency check ---
  if (deal.status !== 'won' || deal.travelFileApprovalStatus !== 'Approved') {
    return;
  }

  if (shouldSkipCreateDueToIdempotency(deal)) {
    return;
  }
  if (hasAnyCreateForDeal(dealId)) {
    return;
  }

  const validation = validateForTravelBoosterCreate(deal, passengers);
  if (!validation.valid) {
    const msg = `Missing or invalid: ${validation.missingFields.join(', ')}`;
    await pipedrive.updateDeal(dealId, {
      [FIELD_KEYS.travelfile_system_status]: 'Failed',
      [FIELD_KEYS.travelbooster_error_message]: msg,
    });
    await pipedrive.createActivity(
      dealId,
      deal.ownerId,
      'TravelFile creation failed',
      `TravelFile creation failed: ${msg}`
    );
    return;
  }

  // Set Creating
  await pipedrive.updateDeal(dealId, {
    [FIELD_KEYS.travelfile_system_status]: 'Creating',
  });

  try {
    const paxPayload: TBCreatePaxFileRequest = {
      tourCode: deal.selectedTourCode!,
      departureDate: deal.departureDate!,
      variant: deal.variant!,
      totalPrice: deal.totalPrice!,
      currency: deal.currency ?? 'USD',
      passengers: passengers.map((p) => ({
        firstName: p.firstName,
        lastName: p.lastName,
        idPassport: p.idPassport!,
        dateOfBirth: p.dateOfBirth!,
      })),
    };
    const tbResult = await travelbooster.createPaxFileOrBooking(paxPayload);
    const bookingId = tbResult.bookingId ?? (tbResult as Record<string, unknown>).booking_id as string | undefined;
    const travelFileNumber = tbResult.travelFileNumber ?? (tbResult as Record<string, unknown>).travel_file_number as string | undefined;

    if (!bookingId && !travelFileNumber) {
      throw new Error('TravelBooster did not return booking ID or travel file number');
    }

    await pipedrive.updateDeal(dealId, {
      [FIELD_KEYS.travelfile_system_status]: 'Created',
      [FIELD_KEYS.travelbooster_booking_id]: bookingId ?? '',
      [FIELD_KEYS.travelfile_number]: travelFileNumber ?? '',
      [FIELD_KEYS.travelbooster_error_message]: '',
    });
    appendAudit({
      deal_id: dealId,
      action: 'created',
      tb_booking_id: bookingId ?? null,
      tb_travelfile_number: travelFileNumber ?? null,
    });
    await pipedrive.createActivity(
      dealId,
      deal.ownerId,
      'TravelFile created',
      `TravelFile created: ${travelFileNumber ?? '—'}, Booking ID: ${bookingId ?? '—'}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pipedrive.updateDeal(dealId, {
      [FIELD_KEYS.travelfile_system_status]: 'Failed',
      [FIELD_KEYS.travelbooster_error_message]: message,
    });
    await pipedrive.createActivity(
      dealId,
      deal.ownerId,
      'TravelFile creation failed',
      `TravelFile creation failed: ${message}`
    );
    appendAudit({
      deal_id: dealId,
      action: 'create_failed',
      tb_booking_id: null,
      tb_travelfile_number: null,
    });
  }
}
