// Helpers for collecting files from a folder drop or <input webkitdirectory>.

export interface FileWithPath {
  file: File;
  relativePath: string; // e.g. "JohnDoe/BA.pdf" or just "BA.pdf"
  folderHint: string | null; // first path segment if nested, else null
}

const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".docx"];
const HIDDEN_OR_JUNK = /(^\.|^Thumbs\.db$|^desktop\.ini$)/i;

// Check for browser folder upload capabilities
export function getFolderUploadSupport(): { supportsDragDrop: boolean; supportsFileInput: boolean; method: string } {
  // Check for File System Access API (modern approach, supported in Chrome, Edge, Opera)
  const hasFileSystemAccessAPI = "showDirectoryPicker" in window;

  // Check for webkitGetAsEntry (Chromium-specific, deprecated but still works)
  // Must check if it's a function on the DataTransferItem prototype
  let hasWebkitEntry = false;
  if (typeof DataTransferItem !== "undefined" && DataTransferItem.prototype) {
    hasWebkitEntry = typeof (DataTransferItem.prototype as unknown as { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry === "function";
  }

  // Check for webkitdirectory support in input
  const testInput = document.createElement("input");
  const hasWebkitDirectory = "webkitdirectory" in testInput || "directory" in testInput;

  return {
    supportsDragDrop: hasFileSystemAccessAPI || hasWebkitEntry,
    supportsFileInput: hasWebkitDirectory,
    method: hasFileSystemAccessAPI ? "FileSystemAccessAPI" : hasWebkitEntry ? "webkitGetAsEntry" : "none"
  };
}

export function isAllowedFile(name: string): boolean {
  if (HIDDEN_OR_JUNK.test(name)) return false;
  const lower = name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function computeFolderHint(relativePath: string): string | null {
  const parts = relativePath.split("/").filter(Boolean);
  if (parts.length <= 1) return null;
  // Skip the top-level dropped folder name; use the immediate parent of the file.
  // For "Cohort/JohnDoe/BA.pdf" -> "JohnDoe". For "JohnDoe/BA.pdf" -> "JohnDoe".
  return parts[parts.length - 2] || null;
}

function makeEntry(file: File, relativePath: string): FileWithPath {
  return {
    file,
    relativePath,
    folderHint: computeFolderHint(relativePath),
  };
}

async function readAllEntries(reader: any): Promise<any[]> {
  const all: any[] = [];
  // Chromium's readEntries returns at most ~100 entries; loop until empty.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch: any[] = await new Promise((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (!batch.length) break;
    all.push(...batch);
  }
  return all;
}

async function walkEntry(entry: any, pathPrefix: string): Promise<FileWithPath[]> {
  if (entry.isFile) {
    const file: File = await new Promise((resolve, reject) =>
      entry.file(resolve, reject),
    );
    if (!isAllowedFile(file.name)) return [];
    return [makeEntry(file, pathPrefix + file.name)];
  }
  if (entry.isDirectory) {
    const reader = entry.createReader();
    const entries = await readAllEntries(reader);
    const nested = await Promise.all(
      entries.map((e) => walkEntry(e, pathPrefix + entry.name + "/")),
    );
    return nested.flat();
  }
  return [];
}

export async function collectFilesFromDataTransfer(
  items: DataTransferItemList,
): Promise<FileWithPath[]> {
  const entries: any[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = (item as any).webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }
  if (!entries.length) return [];
  const collected = await Promise.all(entries.map((e) => walkEntry(e, "")));
  return collected.flat();
}

export function collectFilesFromInput(fileList: FileList): FileWithPath[] {
  const result: FileWithPath[] = [];
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    if (!isAllowedFile(file.name)) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const relPath = (file as any).webkitRelativePath || file.name;
    result.push(makeEntry(file, relPath));
  }
  return result;
}

export function fallbackFromPlainFiles(files: File[]): FileWithPath[] {
  return files
    .filter((f) => isAllowedFile(f.name))
    .map((f) => makeEntry(f, f.name));
}

// File System Access API handler for modern browsers (Chrome, Edge, Opera)
async function collectFilesFromFileSystemAccessAPI(directoryHandle: FileSystemDirectoryHandle): Promise<FileWithPath[]> {
  const results: FileWithPath[] = [];

  async function processHandle(handle: FileSystemHandle, pathPrefix: string): Promise<void> {
    if (handle.kind === "file") {
      const file = await (handle as FileSystemFileHandle).getFile();
      if (!isAllowedFile(file.name)) return;
      const relativePath = pathPrefix + file.name;
      results.push(makeEntry(file, relativePath));
    } else if (handle.kind === "directory") {
      const dirHandle = handle as FileSystemDirectoryHandle;
      const entries = dirHandle.values();
      for await (const entry of entries) {
        await processHandle(entry, pathPrefix + dirHandle.name + "/");
      }
    }
  }

  await processHandle(directoryHandle, "");
  return results;
}

// Open folder picker using File System Access API
export async function openFolderPicker(): Promise<FileWithPath[] | null> {
  try {
    // Check if File System Access API is available
    if (!("showDirectoryPicker" in window)) {
      console.warn("File System Access API not supported in this browser");
      return null;
    }

    const handle = await (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker();
    return await collectFilesFromFileSystemAccessAPI(handle);
  } catch (error) {
    // User cancelled or error occurred
    if ((error as Error).name !== "AbortError") {
      console.error("Error opening folder picker:", error);
    }
    return null;
  }
}
