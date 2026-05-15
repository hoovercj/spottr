/**
 * Google Drive export destination.
 *
 * Uses Google Identity Services (GIS) Web to do a PKCE-based OAuth dance
 * entirely in the browser — no backend, no client secret. The OAuth client
 * ID is a public value baked at build time from `VITE_GOOGLE_OAUTH_CLIENT_ID`.
 * If that env var is unset (e.g. local dev with no Cloud project), the
 * `isGoogleDriveAvailable()` helper returns false and the UI hides the
 * "Connect Google Drive" affordance entirely.
 *
 * Scope: `drive.file` — the app can only see/write files it has created.
 * The app creates (or reuses) a single folder named "Spottr" in the user's
 * My Drive and rotates two files inside it (`spottr-backup.json` and
 * `spottr-backup.csv`). Drive history keeps prior revisions automatically.
 *
 * Tokens are cached in module scope for ~50 minutes (Google grants 1h
 * tokens). On expiry, GIS silently re-requests if consent is still on
 * file — the user only sees a popup on first connect.
 */

import { getDb } from '@/data/db';
import type { ExportDestination, ExportFile } from '@/features/export/destination';

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ?? '') as string;
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = 'Spottr';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

const META_FOLDER_KEY = 'export:googleDriveFolder';

interface GisTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface GisTokenClient {
  requestAccessToken: (opts?: { prompt?: '' | 'none' | 'consent' | 'select_account' }) => void;
}

interface GisOAuth2 {
  initTokenClient(opts: {
    client_id: string;
    scope: string;
    callback: (response: GisTokenResponse) => void;
    error_callback?: (err: { type?: string; message?: string }) => void;
  }): GisTokenClient;
  revoke(token: string, done?: () => void): void;
}

declare global {
  interface Window {
    google?: {
      accounts: { oauth2: GisOAuth2 };
    };
  }
}

interface DriveFolderMeta {
  folderId: string;
}

/** True when a build-time client ID is present — gates the UI. */
export function isGoogleDriveAvailable(): boolean {
  return CLIENT_ID.length > 0;
}

let scriptLoaded: Promise<void> | null = null;
let cachedToken: { value: string; expiresAt: number } | null = null;

function loadGisScript(): Promise<void> {
  if (scriptLoaded) return scriptLoaded;
  scriptLoaded = new Promise<void>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('document unavailable'));
      return;
    }
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      if (window.google?.accounts) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Google Identity Services failed to load')),
        { once: true },
      );
      return;
    }
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Google Identity Services failed to load'));
    document.head.appendChild(s);
  });
  return scriptLoaded;
}

async function requestAccessToken(prompt: '' | 'consent'): Promise<string> {
  if (!CLIENT_ID) throw new Error('Google Drive is not configured for this build');

  // Reuse cached token until ~30s before expiry.
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  await loadGisScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error('Google Identity Services unavailable');

  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (response) => {
        if (response.error) {
          reject(new Error(`Drive auth failed: ${response.error_description ?? response.error}`));
          return;
        }
        const token = response.access_token;
        if (!token) {
          reject(new Error('Drive auth returned no access token'));
          return;
        }
        // Google tokens default to 3600s; subtract 600s headroom so we
        // refresh before the call site sees a 401.
        const ttl = (response.expires_in ?? 3600) - 600;
        cachedToken = { value: token, expiresAt: Date.now() + Math.max(60, ttl) * 1000 };
        resolve(token);
      },
      error_callback: (err) => {
        reject(new Error(`Drive auth failed: ${err.message ?? err.type ?? 'unknown'}`));
      },
    });
    client.requestAccessToken({ prompt });
  });
}

async function driveFetch<T>(
  url: string,
  init: RequestInit & { _retry?: boolean } = {},
): Promise<T> {
  const token = await requestAccessToken('');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401 && !init._retry) {
    // Token must have been revoked between the cache check and the request.
    cachedToken = null;
    return driveFetch<T>(url, { ...init, _retry: true });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Drive API ${res.status}: ${text || res.statusText}`);
  }
  // Some endpoints (e.g. simple uploads) return empty 204; coerce to {}.
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

async function findOrCreateFolder(): Promise<string> {
  // Cached folder id wins.
  const row = await getDb().meta.get(META_FOLDER_KEY);
  const cached = (row?.value as DriveFolderMeta | undefined)?.folderId;
  if (cached) {
    // Verify it still exists and isn't trashed — the user might have
    // moved or deleted it from Drive directly.
    try {
      const meta = await driveFetch<{ id: string; trashed?: boolean }>(
        `https://www.googleapis.com/drive/v3/files/${cached}?fields=id,trashed`,
      );
      if (!meta.trashed) return meta.id;
    } catch {
      // Fall through and rediscover.
    }
  }

  const q = encodeURIComponent(
    `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );
  const search = await driveFetch<{ files: Array<{ id: string }> }>(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
  );
  let folderId = search.files[0]?.id;
  if (!folderId) {
    const created = await driveFetch<{ id: string }>(`https://www.googleapis.com/drive/v3/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });
    folderId = created.id;
  }
  await getDb().meta.put({ key: META_FOLDER_KEY, value: { folderId } satisfies DriveFolderMeta });
  return folderId;
}

/**
 * Trigger OAuth consent + ensure the Spottr folder exists. Called from
 * Settings / Onboarding when the user clicks "Connect Google Drive". Stores
 * the destination kind in meta on success.
 */
export async function connectGoogleDrive(): Promise<{ folderId: string }> {
  // Force the consent prompt on explicit connect so the user gets a clear
  // moment of opting in (vs. a silent re-grant later).
  await requestAccessToken('consent');
  const folderId = await findOrCreateFolder();
  await getDb().meta.put({ key: 'export:destinationKind', value: 'google-drive' });
  await getDb().meta.delete('export:dirHandle');
  return { folderId };
}

/**
 * Best-effort: revoke the Google access token + clear local caches. Drive
 * doesn't have a "log out" — this just discards the current session's token
 * and folder pointer. The user can re-connect at any time.
 */
export async function disconnectGoogleDrive(): Promise<void> {
  const token = cachedToken?.value;
  cachedToken = null;
  await getDb().meta.delete(META_FOLDER_KEY);
  if (token && typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
    await new Promise<void>((resolve) => {
      window.google!.accounts.oauth2.revoke(token, () => resolve());
    });
  }
}

export class GoogleDriveDestination implements ExportDestination {
  kind = 'google-drive' as const;

  constructor(private readonly folderId: string) {}

  async write(file: ExportFile): Promise<void> {
    const escaped = file.name.replace(/'/g, "\\'");
    const q = encodeURIComponent(
      `name = '${escaped}' and '${this.folderId}' in parents and trashed = false`,
    );
    const search = await driveFetch<{ files: Array<{ id: string }> }>(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
    );
    const existingId = search.files[0]?.id;

    // Multipart upload: metadata part + media part in one request.
    const boundary = `----spottr-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const metadata = existingId
      ? { name: file.name }
      : { name: file.name, parents: [this.folderId] };
    const body =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${file.contentType}\r\n\r\n` +
      `${file.contents}\r\n` +
      `--${boundary}--`;

    const url = existingId
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;
    const method = existingId ? 'PATCH' : 'POST';

    await driveFetch<{ id: string }>(url, {
      method,
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
  }
}

/** Resolve the persisted folder id and build a destination ready to write. */
export async function buildGoogleDriveDestination(): Promise<GoogleDriveDestination> {
  if (!CLIENT_ID) throw new Error('Google Drive is not configured for this build');
  // requestAccessToken('') silently reuses the prior grant — this throws if
  // the user hasn't consented yet, which the destination layer surfaces as
  // an AUTH_EXPIRED so the UI can prompt for reconnect.
  await requestAccessToken('');
  const folderId = await findOrCreateFolder();
  return new GoogleDriveDestination(folderId);
}
