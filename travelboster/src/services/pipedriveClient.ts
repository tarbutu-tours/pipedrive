/**
 * Pipedrive API client.
 * Supports: getDeal, updateDeal, createActivity, listDealParticipantsOrPersons.
 */

import axios, { AxiosInstance } from 'axios';
import { config, PIPEDRIVE_FIELD_KEYS, PIPEDRIVE_PERSON_FIELD_KEYS } from '../config';
import type {
  PipedriveDeal,
  PipedrivePerson,
  PipedriveParticipant,
  DealPayload,
  PassengerPayload,
  TravelFileApprovalStatus,
  TravelFileSystemStatus,
} from '../domain/types';

const { baseUrl, apiToken } = config.pipedrive;

function createClient(): AxiosInstance {
  return axios.create({
    baseURL: baseUrl,
    params: { api_token: apiToken },
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Get raw value from object by trying multiple keys (deal/person custom fields may use different key formats). */
function getField(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

function asString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  return String(v);
}

function asNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/**
 * Resolve owner user id from deal.
 */
function getOwnerId(deal: PipedriveDeal): number {
  const u = deal.user_id;
  if (typeof u === 'number') return u;
  if (u && typeof u === 'object' && typeof (u as { id?: number }).id === 'number') return (u as { id: number }).id;
  return 0;
}

/**
 * Normalize deal to DealPayload using known field keys.
 * Pipedrive custom fields are returned under their field key (string); if your instance uses different keys, set them in config or env.
 */
export function normalizeDeal(deal: PipedriveDeal): DealPayload {
  const raw = deal as Record<string, unknown>;
  return {
    dealId: deal.id,
    status: (asString(deal.status) as DealPayload['status']) ?? 'open',
    ownerId: getOwnerId(deal),
    selectedTourCode: asString(getField(raw, PIPEDRIVE_FIELD_KEYS.selectedTourCode, 'selected_tour_code')),
    departureDate: asString(getField(raw, PIPEDRIVE_FIELD_KEYS.departureDate, 'departure_date')),
    variant: asString(getField(raw, PIPEDRIVE_FIELD_KEYS.variant, 'variant')),
    totalPrice: asNumber(getField(raw, PIPEDRIVE_FIELD_KEYS.totalPrice, 'total_price')),
    currency: asString(getField(raw, PIPEDRIVE_FIELD_KEYS.currency, 'currency')),
    travelFileApprovalStatus: (asString(
      getField(raw, PIPEDRIVE_FIELD_KEYS.travelFileApprovalStatus, 'travelfile_approval_status')
    ) as DealPayload['travelFileApprovalStatus']) ?? null,
    travelFileSystemStatus: (asString(
      getField(raw, PIPEDRIVE_FIELD_KEYS.travelFileSystemStatus, 'travelfile_system_status')
    ) as DealPayload['travelFileSystemStatus']) ?? null,
    travelBoosterBookingId: asString(
      getField(raw, PIPEDRIVE_FIELD_KEYS.travelBoosterBookingId, 'travelbooster_booking_id')
    ),
    travelFileNumber: asString(getField(raw, PIPEDRIVE_FIELD_KEYS.travelFileNumber, 'travelfile_number')),
    travelBoosterErrorMessage: asString(
      getField(raw, PIPEDRIVE_FIELD_KEYS.travelBoosterErrorMessage, 'travelbooster_error_message')
    ),
  };
}

/**
 * Normalize person to PassengerPayload.
 */
export function normalizePerson(person: PipedrivePerson): PassengerPayload {
  const raw = person as Record<string, unknown>;
  const firstName = asString(person.first_name ?? getField(raw, 'first_name')) ?? '';
  const lastName = asString(person.last_name ?? getField(raw, 'last_name')) ?? '';
  return {
    personId: person.id,
    firstName,
    lastName,
    idPassport: asString(
      getField(raw, PIPEDRIVE_PERSON_FIELD_KEYS.idPassport, 'id_passport', 'passport_number')
    ),
    dateOfBirth: asString(
      getField(raw, PIPEDRIVE_PERSON_FIELD_KEYS.dateOfBirth, 'date_of_birth', 'dob')
    ),
    gender: asString(getField(raw, PIPEDRIVE_PERSON_FIELD_KEYS.gender, 'gender')) ?? undefined,
    passportExpiry: asString(
      getField(raw, PIPEDRIVE_PERSON_FIELD_KEYS.passportExpiry, 'passport_expiry')
    ) ?? undefined,
    nationality: asString(getField(raw, PIPEDRIVE_PERSON_FIELD_KEYS.nationality, 'nationality')) ?? undefined,
  };
}

/**
 * Test API token: call a simple endpoint to verify connection.
 */
export async function testPipedriveConnection(): Promise<{ ok: boolean; error?: string }> {
  if (!apiToken?.trim()) return { ok: false, error: 'PIPEDRIVE_API_TOKEN is empty' };
  try {
    const client = createClient();
    const { data } = await client.get<{ success?: boolean }>('/deals', { params: { limit: 1 } });
    if (data?.success === true) return { ok: true };
    return { ok: false, error: 'Unexpected response' };
  } catch (err: unknown) {
    const msg = err && typeof err === 'object' && 'response' in err
      ? (err as { response?: { status?: number; data?: unknown } }).response?.data
      : err;
    return { ok: false, error: String(msg ?? (err instanceof Error ? err.message : err)) };
  }
}

/**
 * Get deal by ID (full details including custom fields).
 */
export async function getDeal(dealId: number): Promise<DealPayload | null> {
  const client = createClient();
  const { data } = await client.get<{ data?: PipedriveDeal; success?: boolean }>(`/deals/${dealId}`);
  if (!data?.success || !data.data) return null;
  return normalizeDeal(data.data);
}

/**
 * Update deal custom fields (only pass fields to update).
 */
export async function updateDeal(
  dealId: number,
  fields: Partial<{
    travelfile_approval_status: TravelFileApprovalStatus;
    travelfile_system_status: TravelFileSystemStatus;
    travelbooster_booking_id: string;
    travelfile_number: string;
    travelbooster_error_message: string;
  }>
): Promise<boolean> {
  const client = createClient();
  const { data } = await client.put<{ data?: unknown; success?: boolean }>(`/deals/${dealId}`, fields);
  return data?.success === true;
}

/**
 * Create an activity assigned to deal owner.
 */
export async function createActivity(
  dealId: number,
  ownerId: number,
  subject: string,
  note: string
): Promise<boolean> {
  const client = createClient();
  const { data } = await client.post<{ data?: { id?: number }; success?: boolean }>('/activities', {
    deal_id: dealId,
    person_id: undefined,
    user_id: ownerId,
    subject,
    note,
    done: 0,
  });
  return data?.success === true;
}

/**
 * List deal participants and fetch each person's details (passengers).
 */
export async function listDealParticipantsOrPersons(dealId: number): Promise<PassengerPayload[]> {
  const client = createClient();
  // GET /deals/:id/participants returns participant records (person_id, etc.)
  const partRes = await client.get<{ data?: PipedriveParticipant[]; success?: boolean }>(
    `/deals/${dealId}/participants`
  );
  if (!partRes.data?.success || !Array.isArray(partRes.data.data)) return [];

  const participants = partRes.data.data;
  const persons: PassengerPayload[] = [];
  for (const p of participants) {
    const personId = p.person_id ?? (p as Record<string, unknown>).person_id as number;
    if (!personId) continue;
    const personRes = await client.get<{ data?: PipedrivePerson; success?: boolean }>(
      `/persons/${personId}`
    );
    if (personRes.data?.success && personRes.data.data) {
      persons.push(normalizePerson(personRes.data.data));
    }
  }
  return persons;
}

/** Pipedrive field metadata from API (dealFields / personFields). v1 may use key/name, v2 may use field_code/field_name. */
interface PipedriveFieldMeta {
  key?: string | number;
  name?: string;
  field_code?: string;
  field_name?: string;
  label?: string;
  [k: string]: unknown;
}

/** Result for one required field. */
export interface FieldCheckItem {
  requiredName: string;
  expectedKey: string;
  found: boolean;
  actualKey?: string | null;
  actualName?: string | null;
  hint?: string;
}

export interface RequiredFieldsCheckResult {
  ok: boolean;
  error?: string;
  dealFields: Record<string, FieldCheckItem>;
  personFields: Record<string, FieldCheckItem>;
  envHint?: string;
}

const REQUIRED_DEAL_FIELD_NAMES: Record<keyof typeof PIPEDRIVE_FIELD_KEYS, string> = {
  selectedTourCode: 'Selected Tour Code',
  departureDate: 'Departure Date',
  variant: 'Variant',
  totalPrice: 'Total Price',
  currency: 'Currency',
  travelFileApprovalStatus: 'TravelFile Approval Status',
  travelFileSystemStatus: 'TravelFile System Status',
  travelBoosterBookingId: 'TravelBooster Booking ID',
  travelFileNumber: 'TravelFile Number',
  travelBoosterErrorMessage: 'TravelBooster Error Message',
};

const REQUIRED_PERSON_FIELD_NAMES: Record<keyof typeof PIPEDRIVE_PERSON_FIELD_KEYS, string> = {
  idPassport: 'ID/Passport',
  dateOfBirth: 'Date of Birth',
  gender: 'Gender',
  passportExpiry: 'Passport Expiry',
  nationality: 'Nationality',
};

function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

function findFieldByKeyOrName(
  apiFields: PipedriveFieldMeta[],
  expectedKey: string,
  expectedName: string
): PipedriveFieldMeta | null {
  const nExpected = norm(expectedName);
  for (const f of apiFields) {
    const k = [f.key, f.field_code].find((v) => v != null);
    const keyStr = k != null ? String(k) : '';
    const name = [f.name, f.field_name, f.label].find((v) => typeof v === 'string' && v.trim());
    const nameStr = name != null ? String(name).trim() : '';
    if (keyStr === expectedKey || norm(nameStr) === nExpected) return f;
    if (nameStr && (norm(nameStr).includes(nExpected) || nExpected.includes(norm(nameStr)))) return f;
  }
  return null;
}

/**
 * Fetch deal and person fields from Pipedrive and check that required fields exist.
 * Returns which are found (with their API key) and which are missing.
 */
export async function checkRequiredPipedriveFields(): Promise<RequiredFieldsCheckResult> {
  if (!apiToken?.trim()) {
    return {
      ok: false,
      error: 'PIPEDRIVE_API_TOKEN is empty',
      dealFields: {},
      personFields: {},
    };
  }
  const client = createClient();
  try {
    const [dealRes, personRes] = await Promise.all([
      client.get<{ data?: PipedriveFieldMeta[]; success?: boolean }>('/dealFields'),
      client.get<{ data?: PipedriveFieldMeta[]; success?: boolean }>('/personFields'),
    ]);
    const rawDeal = dealRes.data?.success ? dealRes.data.data : undefined;
    const rawPerson = personRes.data?.success ? personRes.data.data : undefined;
    const dealFieldsList: PipedriveFieldMeta[] = Array.isArray(rawDeal) ? rawDeal : typeof rawDeal === 'object' && rawDeal !== null ? Object.values(rawDeal) : [];
    const personFieldsList: PipedriveFieldMeta[] = Array.isArray(rawPerson) ? rawPerson : typeof rawPerson === 'object' && rawPerson !== null ? Object.values(rawPerson) : [];

    const dealFields: Record<string, FieldCheckItem> = {};
    for (const [ourKey, expectedKey] of Object.entries(PIPEDRIVE_FIELD_KEYS)) {
      const expectedName = REQUIRED_DEAL_FIELD_NAMES[ourKey as keyof typeof REQUIRED_DEAL_FIELD_NAMES];
      const found = findFieldByKeyOrName(dealFieldsList, expectedKey, expectedName);
      const actualKey = found && (found.key != null || found.field_code != null) ? String(found.key ?? found.field_code) : null;
      const actualName = found && (found.name != null || found.field_name != null || found.label != null) ? String(found.name ?? found.field_name ?? found.label) : null;
      dealFields[ourKey] = {
        requiredName: expectedName,
        expectedKey,
        found: !!found,
        actualKey,
        actualName,
        hint: !found ? `Create in Pipedrive Deal fields, or set in .env: PIPEDRIVE_DEAL_FIELD_${ourKey.replace(/([A-Z])/g, '_$1').toUpperCase().replace(/^_/, '')}=<API key>` : undefined,
      };
    }

    const personFields: Record<string, FieldCheckItem> = {};
    for (const [ourKey, expectedKey] of Object.entries(PIPEDRIVE_PERSON_FIELD_KEYS)) {
      const expectedName = REQUIRED_PERSON_FIELD_NAMES[ourKey as keyof typeof REQUIRED_PERSON_FIELD_NAMES];
      const found = findFieldByKeyOrName(personFieldsList, expectedKey, expectedName);
      const pActualKey = found && (found.key != null || found.field_code != null) ? String(found.key ?? found.field_code) : null;
      const pActualName = found && (found.name != null || found.field_name != null || found.label != null) ? String(found.name ?? found.field_name ?? found.label) : null;
      personFields[ourKey] = {
        requiredName: expectedName,
        expectedKey,
        found: !!found,
        actualKey: pActualKey,
        actualName: pActualName,
        hint: !found ? `Create in Pipedrive Person fields, or set in .env: PIPEDRIVE_PERSON_FIELD_${ourKey.replace(/([A-Z])/g, '_$1').toUpperCase().replace(/^_/, '')}=<API key>` : undefined,
      };
    }

    const dealMissing = Object.values(dealFields).filter((v) => !v.found).length;
    const personMissing = Object.values(personFields).filter((v) => !v.found).length;
    const ok = dealMissing === 0 && personMissing === 0;
    const envHint =
      dealMissing > 0 || personMissing > 0
        ? 'For missing fields: create them in Pipedrive (Deal/Person settings) or set the correct API key in .env (see hint per field).'
        : undefined;

    return {
      ok,
      dealFields,
      personFields,
      envHint,
    };
  } catch (err: unknown) {
    const msg = err && typeof err === 'object' && 'response' in err
      ? (err as { response?: { data?: unknown } }).response?.data
      : err;
    return {
      ok: false,
      error: String(msg ?? (err instanceof Error ? err.message : err)),
      dealFields: {},
      personFields: {},
    };
  }
}
