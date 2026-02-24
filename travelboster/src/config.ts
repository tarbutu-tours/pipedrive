/**
 * App config from env.
 */

import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  logLevel: process.env.LOG_LEVEL ?? 'info',

  pipedrive: {
    apiToken: process.env.PIPEDRIVE_API_TOKEN ?? '',
    baseUrl: (process.env.PIPEDRIVE_BASE_URL ?? 'https://api.pipedrive.com/v1').replace(/\/$/, ''),
  },

  travelbooster: {
    baseUrl: (process.env.TB_BASE_URL ?? 'https://tbapi-sandbox.travelbooster.com').replace(/\/$/, ''),
    clientId: process.env.TB_CLIENT_ID ?? '',
    clientSecret: process.env.TB_CLIENT_SECRET ?? '',
    redirectUri: process.env.TB_REDIRECT_URI ?? 'http://localhost:3000/tb/callback',
  },
};

/**
 * Pipedrive custom field keys. Defaults work if your field API keys match.
 * Override via env: PIPEDRIVE_DEAL_FIELD_SELECTED_TOUR_CODE, PIPEDRIVE_PERSON_FIELD_ID_PASSPORT, etc.
 */
function strEnv(name: string, def: string): string {
  const v = process.env[name];
  return typeof v === 'string' && v.trim() ? v.trim() : def;
}

export const PIPEDRIVE_FIELD_KEYS = {
  selectedTourCode: strEnv('PIPEDRIVE_DEAL_FIELD_SELECTED_TOUR_CODE', 'selected_tour_code'),
  departureDate: strEnv('PIPEDRIVE_DEAL_FIELD_DEPARTURE_DATE', 'departure_date'),
  variant: strEnv('PIPEDRIVE_DEAL_FIELD_VARIANT', 'variant'),
  totalPrice: strEnv('PIPEDRIVE_DEAL_FIELD_TOTAL_PRICE', 'total_price'),
  currency: strEnv('PIPEDRIVE_DEAL_FIELD_CURRENCY', 'currency'),
  travelFileApprovalStatus: strEnv('PIPEDRIVE_DEAL_FIELD_TRAVELFILE_APPROVAL_STATUS', 'travelfile_approval_status'),
  travelFileSystemStatus: strEnv('PIPEDRIVE_DEAL_FIELD_TRAVELFILE_SYSTEM_STATUS', 'travelfile_system_status'),
  travelBoosterBookingId: strEnv('PIPEDRIVE_DEAL_FIELD_TRAVELBOOSTER_BOOKING_ID', 'travelbooster_booking_id'),
  travelFileNumber: strEnv('PIPEDRIVE_DEAL_FIELD_TRAVELFILE_NUMBER', 'travelfile_number'),
  travelBoosterErrorMessage: strEnv('PIPEDRIVE_DEAL_FIELD_TRAVELBOOSTER_ERROR_MESSAGE', 'travelbooster_error_message'),
};

export const PIPEDRIVE_PERSON_FIELD_KEYS = {
  idPassport: strEnv('PIPEDRIVE_PERSON_FIELD_ID_PASSPORT', 'id_passport'),
  dateOfBirth: strEnv('PIPEDRIVE_PERSON_FIELD_DATE_OF_BIRTH', 'date_of_birth'),
  gender: strEnv('PIPEDRIVE_PERSON_FIELD_GENDER', 'gender'),
  passportExpiry: strEnv('PIPEDRIVE_PERSON_FIELD_PASSPORT_EXPIRY', 'passport_expiry'),
  nationality: strEnv('PIPEDRIVE_PERSON_FIELD_NATIONALITY', 'nationality'),
};
