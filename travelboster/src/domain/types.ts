/**
 * Domain types for Pipedrive ↔ TravelBooster agent.
 */

/** Pipedrive deal status (built-in). */
export type DealStatus = 'open' | 'won' | 'lost';

/** TravelFile Approval Status (custom dropdown). */
export type TravelFileApprovalStatus = 'Pending' | 'Approved' | 'Cancelled';

/** TravelFile System Status (custom dropdown). */
export type TravelFileSystemStatus = 'Not Sent' | 'Creating' | 'Created' | 'Failed';

/** Person/participant from Pipedrive (passenger). */
export interface PipedrivePerson {
  id: number;
  name: string;
  first_name?: string;
  last_name?: string;
  /** Custom: ID/Passport number */
  [key: string]: unknown;
}

/** Participant link (deal ↔ person). */
export interface PipedriveParticipant {
  person_id: number;
  person?: PipedrivePerson;
}

/** Deal from Pipedrive API (relevant fields). */
export interface PipedriveDeal {
  id: number;
  status: DealStatus;
  title?: string;
  /** Owner user ID */
  user_id: { id: number } | number;
  /** Custom field keys - values in deal object by key id or name */
  [key: string]: unknown;
}

/** Normalized deal fields we care about (after reading custom field keys from config). */
export interface DealPayload {
  dealId: number;
  status: DealStatus;
  ownerId: number;
  selectedTourCode: string | null;
  departureDate: string | null;
  variant: string | null;
  totalPrice: number | null;
  currency: string | null;
  travelFileApprovalStatus: TravelFileApprovalStatus | null;
  travelFileSystemStatus: TravelFileSystemStatus | null;
  travelBoosterBookingId: string | null;
  travelFileNumber: string | null;
  travelBoosterErrorMessage: string | null;
}

/** Normalized passenger (person) for validation and TB. */
export interface PassengerPayload {
  personId: number;
  firstName: string;
  lastName: string;
  idPassport: string | null;
  dateOfBirth: string | null;
  gender?: string | null;
  passportExpiry?: string | null;
  nationality?: string | null;
}

/** Audit log entry. */
export interface AuditEntry {
  deal_id: number;
  action: string;
  timestamp: string; // ISO
  tb_booking_id?: string | null;
  tb_travelfile_number?: string | null;
}

/** TravelBooster create passenger request (shape for API). */
export interface TBCreatePassengerRequest {
  firstName: string;
  lastName: string;
  idPassport: string;
  dateOfBirth: string;
  gender?: string;
  passportExpiry?: string;
  nationality?: string;
}

/** TravelBooster create booking/PaxFile request (shape for API). */
export interface TBCreatePaxFileRequest {
  tourCode: string;
  departureDate: string;
  variant: string;
  totalPrice: number;
  currency: string;
  passengers: Array<{ passengerId?: string; firstName: string; lastName: string; idPassport: string; dateOfBirth: string }>;
}

/** TravelBooster create booking/PaxFile response (expected shape). */
export interface TBCreatePaxFileResponse {
  bookingId?: string;
  travelFileNumber?: string;
  [key: string]: unknown;
}
