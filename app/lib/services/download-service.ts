/**
 * Nexora – Download Service
 *
 * Manages active download tasks using expo-file-system.
 * Integrates with the domain layer (DownloadTask, OfflineLibraryItem) and
 * is designed to delegate completed-item persistence to NexoraContext
 * (which already stores the "library" via addDownload/nexora_downloads).
 *
 * Security rules enforced here:
 *   - Only HLS and MP4 stream types are downloadable
 *   - `canDownload` must be true on the DownloadableAsset
 *   - TMDB-only content (isDownloadable: false) is rejected before this layer
 *   - URLs are validated before passing to FileSystem
 *
 * Usage:
 *   const task = await startDownload(asset, onProgress, onComplete, onError);
 *   await pauseDownload(taskId);
 *   await resumeDownload(taskId);
 *   await cancelDownload(taskId);
 *   const library = await getOfflineLibrary();
 */

import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DownloadableAsset, DownloadTask, OfflineLibraryItem, DownloadStatus } from "@/lib/domain/models";

// ─── Storage ─────────────────────────────────────────────────────────────────

const LIBRARY_KEY = "nx_offline_library";
const DOWNLOAD_DIR = (FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "") + "nexora_downloads/";

// In-memory active task registry
const activeTasks = new Map<string, FileSystem.DownloadResumable>();
const taskMeta = new Map<string, DownloadTask>();

// ─── Validation ───────────────────────────────────────────────────────────────

/** Only permit HTTPS URLs. Blocks HTTP downgrade, data: URIs, etc. */
function assertSecureUrl(url: string): void {
  if (!url.startsWith("https://")) {
    throw new Error(`Insecure or invalid download URL rejected: ${url.slice(0, 60)}`);
  }
}

/** Reject assets that should not be downloaded per the domain contract */
function assertDownloadable(asset: DownloadableAsset): void {
  if (!asset.canDownload) {
    throw new Error(`Asset "${asset.title}" is not marked downloadable`);
  }
  const type = asset.streamSource.type;
  if (type !== "hls" && type !== "mp4") {
    throw new Error(`Download rejected: source type "${type}" is not downloadable (only hls/mp4)`);
  }
  assertSecureUrl(asset.streamSource.uri);
}

// ─── Directory ────────────────────────────────────────────────────────────────

async function ensureDownloadDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(DOWNLOAD_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true });
  }
}

// ─── Library persistence ──────────────────────────────────────────────────────

async function loadLibrary(): Promise<OfflineLibraryItem[]> {
  try {
    const raw = await AsyncStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as OfflineLibraryItem[];
  } catch {
    return [];
  }
}

async function saveLibrary(items: OfflineLibraryItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(items));
  } catch {
    // Non-fatal
  }
}

async function addToLibrary(item: OfflineLibraryItem): Promise<void> {
  const existing = await loadLibrary();
  const next = [item, ...existing.filter(i => i.taskId !== item.taskId)];
  await saveLibrary(next);
}

async function removeFromLibrary(taskId: string): Promise<void> {
  const existing = await loadLibrary();
  await saveLibrary(existing.filter(i => i.taskId !== taskId));
}

// ─── Task ID generation ───────────────────────────────────────────────────────

function generateTaskId(assetId: string): string {
  return `dl_${assetId}_${Date.now()}`;
}

// ─── File path ────────────────────────────────────────────────────────────────

function filePathForTask(taskId: string, type: "hls" | "mp4"): string {
  const ext = type === "mp4" ? "mp4" : "m3u8";
  // Sanitize taskId to safe filename chars
  const safe = taskId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${DOWNLOAD_DIR}${safe}.${ext}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type DownloadProgressCallback = (taskId: string, progress: number, downloadedBytes: number, totalBytes: number) => void;
export type DownloadCompleteCallback = (taskId: string, item: OfflineLibraryItem) => void;
export type DownloadErrorCallback = (taskId: string, error: string) => void;

/**
 * Start a new download.
 * Returns the DownloadTask descriptor immediately; download runs in background.
 * Progress is reported via onProgress. onComplete fires when file is saved.
 */
export async function startDownload(
  asset: DownloadableAsset,
  onProgress: DownloadProgressCallback,
  onComplete: DownloadCompleteCallback,
  onError: DownloadErrorCallback,
): Promise<DownloadTask> {
  assertDownloadable(asset);
  await ensureDownloadDir();

  const taskId = generateTaskId(asset.id);
  const filePath = filePathForTask(taskId, asset.streamSource.type as "hls" | "mp4");

  const task: DownloadTask = {
    taskId,
    asset,
    status: "downloading",
    progress: 0,
    downloadedBytes: 0,
    filePath,
    startedAt: new Date().toISOString(),
    completedAt: null,
    error: null,
  };
  taskMeta.set(taskId, task);

  const dl = FileSystem.createDownloadResumable(
    asset.streamSource.uri,
    filePath,
    {},
    (downloadProgress) => {
      const { totalBytesWritten, totalBytesExpectedToWrite } = downloadProgress;
      const ratio = totalBytesExpectedToWrite > 0
        ? Math.min(1, totalBytesWritten / totalBytesExpectedToWrite)
        : 0;

      const current = taskMeta.get(taskId);
      if (current) {
        current.progress = ratio;
        current.downloadedBytes = totalBytesWritten;
      }
      onProgress(taskId, ratio, totalBytesWritten, totalBytesExpectedToWrite);
    },
  );

  activeTasks.set(taskId, dl);

  // Run download in background
  dl.downloadAsync().then((result) => {
    activeTasks.delete(taskId);

    if (!result) {
      // Cancelled
      taskMeta.delete(taskId);
      return;
    }

    const completedTask = taskMeta.get(taskId);
    if (completedTask) {
      completedTask.status = "completed";
      completedTask.progress = 1;
      completedTask.completedAt = new Date().toISOString();
    }

    const libraryItem: OfflineLibraryItem = {
      taskId,
      title: asset.title,
      type: "movie", // caller overrides for series/channel
      posterUri: null,
      filePath: result.uri,
      fileSizeBytes: result.headers?.["content-length"]
        ? parseInt(result.headers["content-length"], 10)
        : asset.estimatedBytes ?? null,
      downloadedAt: new Date().toISOString(),
      quality: asset.quality ?? null,
      season: null,
      episode: null,
    };

    addToLibrary(libraryItem).catch(() => {});
    onComplete(taskId, libraryItem);
  }).catch((err: Error) => {
    activeTasks.delete(taskId);
    const failedTask = taskMeta.get(taskId);
    if (failedTask) {
      failedTask.status = "failed";
      failedTask.error = err.message ?? "Unknown error";
    }
    onError(taskId, err.message ?? "Download failed");
  });

  return task;
}

/**
 * Pause a running download.
 * The resumable snapshot is saved so it can be resumed later.
 */
export async function pauseDownload(taskId: string): Promise<void> {
  const dl = activeTasks.get(taskId);
  if (!dl) return;
  try {
    await dl.pauseAsync();
    const task = taskMeta.get(taskId);
    if (task) task.status = "paused";
  } catch {
    // Non-fatal
  }
}

/**
 * Resume a paused download.
 */
export async function resumeDownload(
  taskId: string,
  onProgress: DownloadProgressCallback,
  onComplete: DownloadCompleteCallback,
  onError: DownloadErrorCallback,
): Promise<void> {
  const dl = activeTasks.get(taskId);
  if (!dl) return;
  const task = taskMeta.get(taskId);
  if (task) task.status = "downloading";

  dl.resumeAsync().then((result) => {
    activeTasks.delete(taskId);
    if (!result) return;
    if (task) {
      task.status = "completed";
      task.progress = 1;
      task.completedAt = new Date().toISOString();
    }
    const libraryItem: OfflineLibraryItem = {
      taskId,
      title: task?.asset.title ?? "Unknown",
      type: "movie",
      posterUri: null,
      filePath: result.uri,
      fileSizeBytes: task?.asset.estimatedBytes ?? null,
      downloadedAt: new Date().toISOString(),
      quality: task?.asset.quality ?? null,
      season: null,
      episode: null,
    };
    addToLibrary(libraryItem).catch(() => {});
    onComplete(taskId, libraryItem);
  }).catch((err: Error) => {
    activeTasks.delete(taskId);
    if (task) { task.status = "failed"; task.error = err.message; }
    onError(taskId, err.message ?? "Resume failed");
  });
}

/**
 * Cancel and delete a download (active or completed).
 */
export async function cancelDownload(taskId: string): Promise<void> {
  const dl = activeTasks.get(taskId);
  if (dl) {
    try { await dl.cancelAsync(); } catch {}
    activeTasks.delete(taskId);
  }
  const task = taskMeta.get(taskId);
  if (task?.filePath) {
    FileSystem.deleteAsync(task.filePath, { idempotent: true }).catch(() => {});
  }
  taskMeta.delete(taskId);
  await removeFromLibrary(taskId);
}

/**
 * Delete a completed offline library item from disk and storage.
 */
export async function deleteOfflineItem(taskId: string, filePath: string): Promise<void> {
  await FileSystem.deleteAsync(filePath, { idempotent: true }).catch(() => {});
  await removeFromLibrary(taskId);
  taskMeta.delete(taskId);
}

/**
 * Get all completed offline download items (the library).
 */
export async function getOfflineLibrary(): Promise<OfflineLibraryItem[]> {
  return loadLibrary();
}

/**
 * Get all currently active DownloadTask descriptors.
 */
export function getActiveDownloadTasks(): DownloadTask[] {
  return [...taskMeta.values()];
}

/**
 * Get a single DownloadTask by ID.
 */
export function getDownloadTask(taskId: string): DownloadTask | null {
  return taskMeta.get(taskId) ?? null;
}

/**
 * Check whether a given content ID has a completed offline copy.
 * Useful for gating the "Play Offline" button.
 */
export async function isAvailableOffline(assetId: string): Promise<boolean> {
  const library = await loadLibrary();
  return library.some(item => item.taskId.includes(assetId));
}

/**
 * Purge offline files that no longer exist on disk (housekeeping).
 * Call occasionally (e.g. on app start) to avoid stale library entries.
 */
export async function pruneOrphanedOfflineLibrary(): Promise<void> {
  const library = await loadLibrary();
  const surviving: OfflineLibraryItem[] = [];
  for (const item of library) {
    const info = await FileSystem.getInfoAsync(item.filePath).catch(() => null);
    if (info?.exists) surviving.push(item);
  }
  if (surviving.length < library.length) {
    await saveLibrary(surviving);
  }
}
