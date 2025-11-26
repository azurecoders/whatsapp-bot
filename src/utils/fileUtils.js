import fs from "fs";
import path from "path";
import {
  DOWNLOADS_DIR,
  FILE_EXPIRY_TIME,
  CLEANUP_INTERVAL,
} from "../config/index.js";

// Track files for cleanup
export const fileRegistry = new Map(); // filename -> { createdAt, downloaded }

// ==========================
// INITIALIZE DOWNLOADS DIRECTORY
// ==========================
export function initDownloadsDir() {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
    console.log(`📁 Created downloads directory: ${DOWNLOADS_DIR}`);
  }
}

// ==========================
// FORMAT BYTES
// ==========================
export function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// ==========================
// SCHEDULE FILE CLEANUP
// ==========================
export function scheduleFileCleanup(filename) {
  fileRegistry.set(filename, {
    createdAt: Date.now(),
    downloaded: false,
  });

  // Schedule deletion
  setTimeout(() => {
    deleteFile(filename);
  }, FILE_EXPIRY_TIME);
}

// ==========================
// DELETE FILE
// ==========================
export function deleteFile(filename) {
  try {
    const filePath = path.join(DOWNLOADS_DIR, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Deleted file: ${filename}`);
    }
    fileRegistry.delete(filename);
  } catch (err) {
    console.error(`❌ Error deleting file ${filename}:`, err);
  }
}

// ==========================
// PERIODIC CLEANUP
// ==========================
export function startPeriodicCleanup() {
  setInterval(() => {
    console.log("🧹 Running periodic cleanup...");
    const now = Date.now();

    // Clean up registry
    for (const [filename, info] of fileRegistry.entries()) {
      if (now - info.createdAt > FILE_EXPIRY_TIME) {
        deleteFile(filename);
      }
    }

    // Clean up any orphaned files
    try {
      const files = fs.readdirSync(DOWNLOADS_DIR);
      for (const file of files) {
        const filePath = path.join(DOWNLOADS_DIR, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > FILE_EXPIRY_TIME * 2) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Cleaned orphaned file: ${file}`);
        }
      }
    } catch (err) {
      console.error("❌ Cleanup error:", err);
    }
  }, CLEANUP_INTERVAL);
}

// ==========================
// CLEAN ALL TEMPORARY FILES
// ==========================
export function cleanAllTempFiles() {
  try {
    const files = fs.readdirSync(DOWNLOADS_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(DOWNLOADS_DIR, file));
    }
    console.log(`   Deleted ${files.length} temporary files`);
    return files.length;
  } catch (err) {
    console.error("   Error cleaning up:", err.message);
    return 0;
  }
}

// ==========================
// GET FILES LIST
// ==========================
export function getFilesList() {
  const files = [];
  for (const [filename, info] of fileRegistry.entries()) {
    const filePath = path.join(DOWNLOADS_DIR, filename);
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      files.push({
        filename,
        size: formatBytes(stats.size),
        createdAt: new Date(info.createdAt).toISOString(),
        downloaded: info.downloaded,
        expiresAt: new Date(info.createdAt + FILE_EXPIRY_TIME).toISOString(),
      });
    }
  }
  return files;
}
