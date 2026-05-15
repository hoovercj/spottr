/**
 * Local file export destination.
 *
 * Primary path: File System Access API (`showDirectoryPicker` + handle
 * persisted in IndexedDB). Permission is re-queried on each session per
 * FSA semantics.
 *
 * Fallback path: anchor-tag download (`<a download>` + Blob URL). Used when
 * the browser lacks FSA or when the user opts to switch to "Download backups
 * to my downloads folder" in settings.
 *
 * Tests inject a `MemoryDestination` directly into the service via the
 * `setDestinationFactory()` test seam to avoid mocking FSA in jsdom.
 */

import { getDb } from '@/data/db';

export interface ExportFile {
  name: string;
  contents: string;
  contentType: 'application/json' | 'text/csv';
}

export interface ExportDestination {
  kind: 'local-directory' | 'download' | 'google-drive' | 'memory';
  write(file: ExportFile): Promise<void>;
}

const META_HANDLE_KEY = 'export:dirHandle';
const META_KIND_KEY = 'export:destinationKind';

/** ----- LocalDirectory implementation ----- */

class LocalDirectoryDestination implements ExportDestination {
  kind = 'local-directory' as const;

  constructor(private readonly dirHandle: FileSystemDirectoryHandle) {}

  async write(file: ExportFile): Promise<void> {
    const fileHandle = await this.dirHandle.getFileHandle(file.name, { create: true });
    const writable = await fileHandle.createWritable();
    try {
      await writable.write(file.contents);
    } finally {
      await writable.close();
    }
  }
}

/** ----- Download fallback ----- */

class DownloadDestination implements ExportDestination {
  kind = 'download' as const;

  async write(file: ExportFile): Promise<void> {
    if (typeof document === 'undefined') {
      throw new Error('download destination unavailable: no document');
    }
    const blob = new Blob([file.contents], { type: file.contentType });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      // Revoke after a tick so the download can start.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return Promise.resolve();
  }
}

/** ----- Public selection / configuration API ----- */

export type DestinationKind = ExportDestination['kind'];

export async function getCurrentDestinationKind(): Promise<DestinationKind | null> {
  const row = await getDb().meta.get(META_KIND_KEY);
  return (row?.value as DestinationKind | undefined) ?? null;
}

export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export async function chooseLocalDirectory(): Promise<{ kind: 'local-directory' } | null> {
  if (!supportsFileSystemAccess()) return null;
  const picker = (
    window as Window & { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> }
  ).showDirectoryPicker;
  if (!picker) return null;
  const handle = await picker();
  const permissionState = await ensurePermission(handle, 'readwrite');
  if (permissionState !== 'granted') {
    throw new Error('Permission to write to the chosen directory was denied');
  }
  await getDb().meta.put({ key: META_HANDLE_KEY, value: handle });
  await getDb().meta.put({ key: META_KIND_KEY, value: 'local-directory' });
  return { kind: 'local-directory' };
}

export async function chooseDownloadFallback(): Promise<{ kind: 'download' }> {
  await getDb().meta.put({ key: META_KIND_KEY, value: 'download' });
  await getDb().meta.delete(META_HANDLE_KEY);
  return { kind: 'download' };
}

/** ----- Factory + test seam ----- */

type Factory = () => Promise<ExportDestination>;

let factoryOverride: Factory | null = null;

export function setDestinationFactory(f: Factory | null): void {
  factoryOverride = f;
}

export async function getDestination(): Promise<ExportDestination> {
  if (factoryOverride) return factoryOverride();

  const kind = await getCurrentDestinationKind();
  if (kind === 'local-directory') {
    const row = await getDb().meta.get(META_HANDLE_KEY);
    const handle = row?.value as FileSystemDirectoryHandle | undefined;
    if (handle) {
      const state = await ensurePermission(handle, 'readwrite');
      if (state === 'granted') {
        return new LocalDirectoryDestination(handle);
      }
    }
    // Fall through if we can't get the handle back.
  }
  if (kind === 'download') {
    return new DownloadDestination();
  }
  if (kind === 'google-drive') {
    // Imported lazily so the GIS network call + ~30KB module aren't paid
    // for users on a local-file destination.
    const { buildGoogleDriveDestination } = await import('@/features/export/googleDrive');
    return buildGoogleDriveDestination();
  }
  throw new Error('No export destination configured');
}

async function ensurePermission(
  handle: FileSystemHandle,
  mode: 'read' | 'readwrite',
): Promise<PermissionState> {
  const h = handle as FileSystemHandle & {
    queryPermission?: (opts: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (opts: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  };
  if (!h.queryPermission || !h.requestPermission) return 'granted';
  const current = await h.queryPermission({ mode });
  if (current === 'granted') return 'granted';
  return h.requestPermission({ mode });
}

/** Test-only helper for the memory destination. */
export class MemoryDestination implements ExportDestination {
  kind = 'memory' as const;
  files: ExportFile[] = [];
  async write(file: ExportFile): Promise<void> {
    this.files.push(file);
    return Promise.resolve();
  }
}
