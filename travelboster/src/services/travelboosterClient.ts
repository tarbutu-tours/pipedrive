/**
 * TravelBooster API client.
 * OAuth2: GET /auth/auth → user authorizes → POST /auth/token with code.
 * Business calls use Authorization: Bearer {access_token}.
 * Token obtained per flow; minimal in-memory cache, optional file cache for server restart.
 */

import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import type {
  TBCreatePassengerRequest,
  TBCreatePaxFileRequest,
  TBCreatePaxFileResponse,
} from '../domain/types';

const { baseUrl, clientId, clientSecret, redirectUri } = config.travelbooster;

const TOKEN_FILE = path.join(__dirname, '../store/tb-token.json');

interface TokenData {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number; // we set this from expires_in
}

let cachedToken: TokenData | null = null;

function ensureStoreDir(): void {
  const dir = path.dirname(TOKEN_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadStoredToken(): TokenData | null {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const raw = fs.readFileSync(TOKEN_FILE, 'utf-8');
      const t = JSON.parse(raw) as TokenData;
      if (t.expires_at && t.expires_at > Date.now() / 1000 + 60) return t; // 1 min buffer
      if (!t.expires_at && t.access_token) return t;
    }
  } catch {
    // ignore
  }
  return null;
}

function saveToken(t: TokenData): void {
  ensureStoreDir();
  const copy = { ...t };
  if (copy.expires_in && !copy.expires_at) {
    copy.expires_at = Math.floor(Date.now() / 1000) + copy.expires_in;
  }
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(copy, null, 2), 'utf-8');
  cachedToken = copy;
}

/**
 * Step 1: Build authorization URL for OAuth (user opens in browser).
 */
export function getAuthorizationUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'login',
    response_type: 'code',
    state: state ?? String(Date.now()),
  });
  return `${baseUrl}/auth/auth?${params.toString()}`;
}

/**
 * Step 2: Exchange authorization code for access token.
 * Call this when you receive the code (e.g. in GET /tb/callback?code=...).
 */
export async function exchangeCodeForToken(code: string): Promise<TokenData> {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  const { data } = await axios.post<TokenData>(`${baseUrl}/auth/token`, body, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const token: TokenData = {
    ...data,
    expires_at: data.expires_in
      ? Math.floor(Date.now() / 1000) + data.expires_in
      : undefined,
  };
  saveToken(token);
  return token;
}

/**
 * Get a valid access token. Uses cached or stored token; if expired, throws (caller should re-auth).
 * Obtain token per business flow: no single shared token across all flows.
 */
export async function getAccessToken(): Promise<string> {
  const t = cachedToken ?? loadStoredToken();
  if (t && t.access_token) {
    if (t.expires_at && t.expires_at > Date.now() / 1000 + 60) return t.access_token;
    // TODO: if we have refresh_token, try refresh here
  }
  throw new Error(
    'TravelBooster access token missing or expired. Complete OAuth flow (GET /auth/auth then POST /auth/token with code).'
  );
}

function createAuthenticatedClient(accessToken: string): AxiosInstance {
  return axios.create({
    baseURL: baseUrl,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

/**
 * Create passenger/customer in TravelBooster.
 * Swagger: POST /tbapi/v1/Customer/CreatePassenger, body = ApiSetCustomer.
 * Response: 200 with integer (customer Index).
 */
export async function createPassenger(
  payload: TBCreatePassengerRequest
): Promise<{ passengerId?: string; id?: number; [k: string]: unknown }> {
  const token = await getAccessToken();
  const client = createAuthenticatedClient(token);
  const body: Record<string, unknown> = {
    FirstName: payload.firstName,
    LastName: payload.lastName,
    BirthDate: payload.dateOfBirth,
    PersonalID: payload.idPassport,
    Gender: payload.gender ?? undefined,
  };
  if (payload.passportExpiry || payload.nationality) {
    body.Passports = [
      {
        PassportNumber: payload.idPassport,
        Nationality: payload.nationality,
        ExpirationDate: payload.passportExpiry,
      },
    ];
  }
  const response = await client.post<number>('/tbapi/v1/Customer/CreatePassenger', body);
  const index = typeof response.data === 'number' ? response.data : (response.data as { data?: number })?.data;
  return {
    passengerId: index != null ? String(index) : undefined,
    id: index,
  };
}

/**
 * Create booking / travel file (PaxFile) in TravelBooster.
 * Swagger: POST /tbapi/v1/Paxfile/CreatePaxFile, body = ApiSetPaxFile (ID: 0, Currency, Customers, Type: "Tour").
 * Response: ApiPaxFile with ID, PaxFileNumber.
 */
export async function createPaxFileOrBooking(
  payload: TBCreatePaxFileRequest
): Promise<TBCreatePaxFileResponse> {
  const token = await getAccessToken();
  const client = createAuthenticatedClient(token);
  const Customers = payload.passengers.map((p) => ({
    FirstName: p.firstName,
    LastName: p.lastName,
    BirthDate: p.dateOfBirth,
    PersonalID: p.idPassport,
    Passports: [{ PassportNumber: p.idPassport }],
  }));
  const body = {
    ID: 0,
    Currency: payload.currency,
    Type: 'Tour',
    Name: `${payload.tourCode} ${payload.departureDate} ${payload.variant}`,
    Customers,
  };
  const response = await client.post<{ ID?: number; PaxFileNumber?: number }>(
    '/tbapi/v1/Paxfile/CreatePaxFile',
    body
  );
  const data = response.data;
  const id = data?.ID;
  const paxFileNumber = data?.PaxFileNumber;
  return {
    bookingId: id != null ? String(id) : undefined,
    travelFileNumber: paxFileNumber != null ? String(paxFileNumber) : undefined,
  };
}
