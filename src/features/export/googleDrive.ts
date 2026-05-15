/**
 * Google Drive export destination.
 *
 * Uses Google Identity Services (GIS) Web to drive an Authorization Code
 * + PKCE flow entirely in the browser — no backend, no client secret. GIS
 * handles PKCE internally and returns an auth code; we exchange the code
 * for an access_token + refresh_token at Google's token endpoint with
 * `redirect_uri=postmessage` (the magic value for popup-based JS clients).
 *
 * The refresh_token is persisted to IndexedDB so subsequent syncs can mint
 * fresh access tokens silently via a plain `fetch` to the token endpoint —
 * no popups, no dependence on GIS browser-session cookies. The access
 * token is also cached (memory + IndexedDB) so a page reload mid-window
 * doesn't force a network round-trip.
 *
 * Scope: `drive.file` — the app can only see/write files it has created.
 * The app creates (or reuses) a single folder named "Spottr" in the user's
 * My Drive and rotates two files inside it (`spottr-backup.json` and
 * `spottr-backup.csv`). Drive history keeps prior revisions automatically.
 */

import { getDb } from '@/data/db';
import type { ExportDestination, ExportFile } from '@/features/export/destination';

const CLIENT_ID = (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ?? '') as string;
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = 'Spottr';
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

const META_FOLDER_KEY = 'export:googleDriveFolder';
const META_REFRESH_TOKEN_KEY = 'export:googleDriveRefreshToken';
const META_ACCESS_TOKEN_KEY = 'export:googleDriveAccessToken';

interface GisCodeResponse {
  code?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

interface GisCodeClient {
  requestCode: () => void;
}

interface GisOAuth2 {
  initCodeClient(opts: {
    client_id: string;
    scope: string;
    ux_mode: 'popup' | 'redirect';
    /** Trigger a refresh_token return by requesting offline access. */
    access_type?: 'offline' | 'online';
    /** Forcing `consent` ensures Google issues a refresh_token even on re-connect. */
    prompt?: '' | 'none' | 'consent' | 'select_account';
    callback: (response: GisCodeResponse) => void;
    error_callback?: (err: { type?: string; message?: string }) => void;
  }): GisCodeClient;
  revoke(token: string, done?: () => void): void;
}

declare global {
  interface Window {
    google?: {
      accounts: { oauth2: GisOAuth2 };
    };
  }
}

/** Persisted shape for the access token in IndexedDB (under META_ACCESS_TOKEN_KEY). */
interface PersistedAccessToken {
  value: string;
  /** Epoch ms when the cached token should be treated as expired. */
  expiresAt: number;
}

/** Token-endpoint response shape. The same object covers initial exchange + refresh. */
interface TokenEndpointResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface DriveFolderMeta {
  folderId: string;
}

/** True when a build-time client ID is present — gates the UI. */
export function isGoogleDriveAvailable(): boolean {
  return CLIENT_ID.length > 0;
}

let scriptLoaded: Promise<void> | null = null;
/**
 * In-memory mirror of the persisted access token. Keeps the hot path
 * (every Drive call hits this) free of an IndexedDB round-trip. Synced
 * lazily on the first read after module init and on every write.
 */
let cachedToken: PersistedAccessToken | null = null;
let cachedTokenLoaded = false;

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

/** Load the persisted access token into memory if we haven't yet this session. */
async function hydrateCachedToken(): Promise<void> {
  if (cachedTokenLoaded) return;
  cachedTokenLoaded = true;
  const row = await getDb().meta.get(META_ACCESS_TOKEN_KEY);
  const value = row?.value as PersistedAccessToken | undefined;
  if (value && typeof value.value === 'string' && typeof value.expiresAt === 'number') {
    cachedToken = value;
  }
}

async function persistAccessToken(token: PersistedAccessToken): Promise<void> {
  cachedToken = token;
  await getDb().meta.put({ key: META_ACCESS_TOKEN_KEY, value: token });
}

async function clearPersistedTokens(): Promise<void> {
  cachedToken = null;
  cachedTokenLoaded = true;
  await getDb().meta.delete(META_ACCESS_TOKEN_KEY);
  await getDb().meta.delete(META_REFRESH_TOKEN_KEY);
}

async function getRefreshToken(): Promise<string | null> {
  const row = await getDb().meta.get(META_REFRESH_TOKEN_KEY);
  const value = row?.value;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function setRefreshToken(token: string): Promise<void> {
  await getDb().meta.put({ key: META_REFRESH_TOKEN_KEY, value: token });
}

/**
 * Compute an absolute expiry timestamp from a token endpoint's `expires_in`.
 * 600s of headroom keeps us refreshing before the call site sees a 401.
 */
function expiryFromTtl(expiresIn: number | undefined): number {
  const ttl = (expiresIn ?? 3600) - 600;
  return Date.now() + Math.max(60, ttl) * 1000;
}

/** POST to Google's token endpoint with `application/x-www-form-urlencoded` body. */
async function postToken(body: Record<string, string>): Promise<TokenEndpointResponse> {
  const form = new URLSearchParams(body);
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  // Both 200 and 400 return parseable JSON; the caller checks `.error`.
  return (await res.json()) as TokenEndpointResponse;
}

/**
 * Drive a fresh consent popup through GIS Code Client, then exchange the
 * resulting auth code for `{ access_token, refresh_token }`. Persists both.
 */
async function runConsentFlow(): Promise<PersistedAccessToken> {
  await loadGisScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error('Google Identity Services unavailable');

  const code = await new Promise<string>((resolve, reject) => {
    const client = oauth2.initCodeClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      ux_mode: 'popup',
      // `offline` access asks Google to return a refresh_token; combined
      // with `prompt: 'consent'` it's also reissued on every re-connect
      // (Google sometimes withholds the refresh_token on subsequent grants
      // when the prior one is still valid).
      access_type: 'offline',
      prompt: 'consent',
      callback: (response) => {
        if (response.error) {
          reject(new Error(`Drive auth failed: ${response.error_description ?? response.error}`));
          return;
        }
        if (!response.code) {
          reject(new Error('Drive auth returned no code'));
          return;
        }
        resolve(response.code);
      },
      error_callback: (err) => {
        reject(new Error(`Drive auth failed: ${err.message ?? err.type ?? 'unknown'}`));
      },
    });
    client.requestCode();
  });

  // `postmessage` is the magic redirect_uri for GIS popup-based code
  // exchange — Google's token endpoint accepts the GIS-issued code paired
  // with the client_id without requiring our own PKCE verifier (GIS held
  // and proved it internally during the popup round-trip).
  const body = await postToken({
    code,
    client_id: CLIENT_ID,
    grant_type: 'authorization_code',
    redirect_uri: 'postmessage',
  });
  if (body.error || !body.access_token) {
    throw new Error(
      `Drive token exchange failed: ${body.error_description ?? body.error ?? 'no token returned'}`,
    );
  }
  if (body.refresh_token) {
    await setRefreshToken(body.refresh_token);
  }
  const token: PersistedAccessToken = {
    value: body.access_token,
    expiresAt: expiryFromTtl(body.expires_in),
  };
  await persistAccessToken(token);
  return token;
}

/** Exchange the stored refresh token for a fresh access token. */
async function runRefreshFlow(refreshToken: string): Promise<PersistedAccessToken> {
  const body = await postToken({
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    grant_type: 'refresh_token',
  });
  if (body.error === 'invalid_grant') {
    // The refresh token was revoked from the Google account, expired
    // (testing-mode apps cap them at 7 days), or otherwise rejected. Wipe
    // local state so the caller surfaces a clean reconnect prompt.
    await clearPersistedTokens();
    throw new Error('Drive refresh token rejected — reconnect required');
  }
  if (body.error || !body.access_token) {
    throw new Error(
      `Drive token refresh failed: ${body.error_description ?? body.error ?? 'no token returned'}`,
    );
  }
  // Google may rotate refresh tokens; persist the new one if returned.
  if (body.refresh_token) await setRefreshToken(body.refresh_token);
  const token: PersistedAccessToken = {
    value: body.access_token,
    expiresAt: expiryFromTtl(body.expires_in),
  };
  await persistAccessToken(token);
  return token;
}

async function requestAccessToken(prompt: '' | 'consent'): Promise<string> {
  if (!CLIENT_ID) throw new Error('Google Drive is not configured for this build');

  // Explicit consent — used by the Connect button. Always runs the popup
  // path and replaces any prior tokens.
  if (prompt === 'consent') {
    const fresh = await runConsentFlow();
    return fresh.value;
  }

  // Silent path. Memory → IndexedDB → refresh endpoint → fail.
  await hydrateCachedToken();
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }
  const refresh = await getRefreshToken();
  if (!refresh) {
    throw new Error('Drive auth required — no refresh token on file');
  }
  const fresh = await runRefreshFlow(refresh);
  return fresh.value;
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
    // Token rejected between cache check and request — wipe the cached
    // access token (memory + persisted) so the retry forces a refresh.
    // The refresh token stays intact so the refresh path can run silently.
    cachedToken = null;
    await getDb().meta.delete(META_ACCESS_TOKEN_KEY);
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
  await hydrateCachedToken();
  const token = cachedToken?.value;
  await clearPersistedTokens();
  await getDb().meta.delete(META_FOLDER_KEY);
  if (token && typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
    await new Promise<void>((resolve) => {
      window.google!.accounts.oauth2.revoke(token, () => resolve());
    });
  }
}

export interface DriveWriteResult {
  fileId: string;
  headRevisionId: string;
}

export interface DriveFileMeta {
  fileId: string;
  headRevisionId: string;
  modifiedTime: string;
}

export class GoogleDriveDestination implements ExportDestination {
  kind = 'google-drive' as const;
  /** Populated as the most recent write's result so the service layer can
   * persist (fileId, headRevisionId) into meta:lastOk. */
  lastWrite: DriveWriteResult | null = null;

  constructor(private readonly folderId: string) {}

  async write(file: ExportFile): Promise<void> {
    const result = await this.upload(file);
    this.lastWrite = result;
  }

  async upload(file: ExportFile): Promise<DriveWriteResult> {
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
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart&fields=id,headRevisionId`
      : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,headRevisionId`;
    const method = existingId ? 'PATCH' : 'POST';

    const resp = await driveFetch<{ id: string; headRevisionId?: string }>(url, {
      method,
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    return { fileId: resp.id, headRevisionId: resp.headRevisionId ?? '' };
  }
}

/**
 * Look up the current head revision of the JSON backup in the Spottr
 * folder. Returns null when:
 *   - Drive isn't connected for this build (no client id), or
 *   - the user previously connected but the folder pointer is stale, or
 *   - the file doesn't exist yet (first-time push hasn't happened).
 * Throws on auth / network errors so callers can distinguish "not synced
 * yet" from "Drive said no."
 */
export async function fetchDriveBackupMeta(filename: string): Promise<DriveFileMeta | null> {
  if (!CLIENT_ID) return null;
  const folderRow = await getDb().meta.get(META_FOLDER_KEY);
  const folderId = (folderRow?.value as DriveFolderMeta | undefined)?.folderId;
  if (!folderId) return null;
  await requestAccessToken('');
  const escaped = filename.replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `name = '${escaped}' and '${folderId}' in parents and trashed = false`,
  );
  const search = await driveFetch<{ files: Array<{ id: string }> }>(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`,
  );
  const fileId = search.files[0]?.id;
  if (!fileId) return null;
  const meta = await driveFetch<{
    id: string;
    headRevisionId?: string;
    modifiedTime?: string;
  }>(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,headRevisionId,modifiedTime`);
  return {
    fileId: meta.id,
    headRevisionId: meta.headRevisionId ?? '',
    modifiedTime: meta.modifiedTime ?? '',
  };
}

/** Stream the JSON backup's contents from Drive into a parsed payload. */
export async function downloadDriveBackup(filename: string): Promise<string | null> {
  const meta = await fetchDriveBackupMeta(filename);
  if (!meta) return null;
  const token = await requestAccessToken('');
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${meta.fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Drive download failed: ${res.status} ${text || res.statusText}`);
  }
  return res.text();
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
