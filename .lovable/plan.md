

## Add Folder Upload to Bulk Upload

Extend the existing bulk upload flow so admins can drop (or pick) an entire folder of candidate documents instead of selecting files one-by-one. The Assessment Tools system will not be touched.

### What Changes for the User

In the **Upload Modal** (Document Validation flow only):
- The existing file picker gets a new sibling button: **"Choose Folder"**.
- The drop zone now also accepts folders dragged from the OS file explorer — every file inside (including nested subfolders) is collected recursively.
- Each file's relative path inside the folder is preserved and shown in the file list (e.g. `JohnDoe/BA.pdf`) so admins can see the folder structure they uploaded.
- Subfolder names are used as a hint for candidate grouping — files inside the same subfolder are biased toward being grouped under the same candidate, on top of the existing name-matching algorithm.

Everything else (duplicate resolution, session naming, cross-cohort checks, AI processing, candidate cards) stays exactly the same.

### Where the Changes Land

**1. `src/components/UploadModal.tsx`** (only file with UI changes)
- Add a second hidden `<input type="file" webkitdirectory directory multiple />` and a "Choose Folder" button next to the existing "Choose Files" button.
- Update the drop zone's `onDrop` handler to use the `DataTransferItemList` API and walk `webkitGetAsEntry()` recursively, collecting every `FileSystemFileEntry` into a flat `File[]` while stamping each file with its `webkitRelativePath`-equivalent path.
- Render the relative path under the filename in the staged-files list.
- Filter to allowed extensions (`.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.docx`) — silently skip junk like `.DS_Store`, `Thumbs.db`, hidden files.
- Enforce the existing per-file size limit and show a toast for any skipped files.

**2. `src/lib/` — new helper `folderUpload.ts`**
- `collectFilesFromDataTransfer(items: DataTransferItemList): Promise<FileWithPath[]>` — recursive `FileSystemDirectoryReader` walker.
- `collectFilesFromInput(fileList: FileList): FileWithPath[]` — wraps files coming from a `webkitdirectory` input and preserves `webkitRelativePath`.
- Returns a uniform `FileWithPath = { file: File; relativePath: string; folderHint: string | null }` where `folderHint` is the immediate parent folder name (used for grouping).

**3. `src/lib/` — extend the existing grouping logic**
- The current name-matching algorithm in the document-grouping module gets one extra signal: when two files share the same non-empty `folderHint`, they get a strong boost toward being grouped under the same candidate. Name-matching remains the primary signal so existing behaviour for flat uploads is unchanged.

### Out of Scope
- No DB schema change — relative paths are kept in memory only for the upload session and used to drive grouping; we do **not** persist `relative_path` on the `documents` table.
- No change to the edge function, AI prompts, validation rules, or the Assessment Tools system.
- No change to session naming, duplicate resolution, or cross-cohort checks.

### Technical Details
- Folder traversal uses the standard `DataTransferItem.webkitGetAsEntry()` → `FileSystemDirectoryEntry.createReader().readEntries()` loop, paginated until `readEntries` returns an empty array (Chromium quirk).
- The `<input webkitdirectory>` attribute is supported in all evergreen browsers; we cast via `React.InputHTMLAttributes` augmentation to satisfy TypeScript.
- `folderHint` is computed as the **first path segment** of the relative path when the file lives inside a subfolder, otherwise `null`. Top-level files behave exactly as today.
- Grouping boost is additive and capped so a strong name match still beats a weak folder coincidence — protects against admins dumping unrelated files into one folder.
- Skipped/invalid files are surfaced in a single summary toast (`"3 files skipped: unsupported type or hidden"`) instead of one toast per file.

