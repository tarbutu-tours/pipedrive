/**
 * File-based audit log for MVP.
 * Path: ./travelboster/src/store/audit.json (created at runtime if missing).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AuditEntry } from '../domain/types';

const AUDIT_FILE = path.join(__dirname, 'audit.json');

function ensureStoreDir(): void {
  const dir = path.dirname(AUDIT_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function ensureAuditFile(): void {
  ensureStoreDir();
  try {
    fs.accessSync(AUDIT_FILE);
  } catch {
    fs.writeFileSync(AUDIT_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

function readEntries(): AuditEntry[] {
  ensureAuditFile();
  const raw = fs.readFileSync(AUDIT_FILE, 'utf-8');
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: AuditEntry[]): void {
  ensureAuditFile();
  fs.writeFileSync(AUDIT_FILE, JSON.stringify(entries, null, 2), 'utf-8');
}

/**
 * Append an audit entry.
 */
export function appendAudit(entry: Omit<AuditEntry, 'timestamp'>): void {
  const entries = readEntries();
  entries.push({
    ...entry,
    timestamp: new Date().toISOString(),
  });
  writeEntries(entries);
}

/**
 * Check if we already have a "create" action for this deal with the given TB identifiers (idempotency).
 */
export function hasExistingCreateForDeal(
  dealId: number,
  tbBookingId?: string | null,
  tbTravelFileNumber?: string | null
): boolean {
  const entries = readEntries();
  return entries.some(
    (e) =>
      e.deal_id === dealId &&
      (e.action === 'created' || e.action === 'create') &&
      (e.tb_booking_id === tbBookingId || e.tb_travelfile_number === tbTravelFileNumber)
  );
}

/**
 * Check if we already created something for this deal (any create entry).
 */
export function hasAnyCreateForDeal(dealId: number): boolean {
  const entries = readEntries();
  return entries.some((e) => e.deal_id === dealId && (e.action === 'created' || e.action === 'create'));
}
