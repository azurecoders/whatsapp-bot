import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  DOWNLOADS_DIR,
  TIMEOUTS,
  SERVER_URL,
  FRONTEND_URL,
  FILE_EXPIRY_TIME,
} from "../config/index.js";
import {
  getBrowser,
  getPage,
  ensureBrowserHealth,
  navigateToUrl,
  isProcessing,
  setProcessing,
  getLoginStatus,
} from "./browserService.js";
import { transformFreepikUrl } from "../utils/urlUtils.js";
import { formatBytes, scheduleFileCleanup } from "../utils/fileUtils.js";

// ==========================
// WAIT FOR DOWNLOAD COMPLETION
// ==========================
async function waitForDownload(
  downloadDir,
  filesBefore,
  timeout = TIMEOUTS.downloadComplete
) {
  const startTime = Date.now();
  console.log(`⏱️ Waiting for download (timeout: ${timeout / 1000}s)...`);

  while (Date.now() - startTime < timeout) {
    const currentFiles = fs.readdirSync(downloadDir);
    const newFiles = currentFiles.filter((f) => !filesBefore.has(f));

    const completedFile = newFiles.find(
      (f) =>
        !f.endsWith(".crdownload") &&
        !f.endsWith(".tmp") &&
        !f.endsWith(".download") &&
        !f.endsWith(".partial")
    );

    if (completedFile) {
      await new Promise((r) => setTimeout(r, 2000));

      const filePath = path.join(downloadDir, completedFile);
      try {
        const stats = fs.statSync(filePath);
        if (stats.size > 0) {
          console.log(
            `✅ Download completed: ${completedFile} (${formatBytes(
              stats.size
            )})`
          );
          return completedFile;
        }
      } catch (e) {}
    }

    const elapsed = Date.now() - startTime;
    if (elapsed % 10000 < 600) {
      console.log(
        `⏳ Still downloading... (${Math.floor(elapsed / 1000)}s elapsed)`
      );
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  return null;
}

// ==========================
// MAIN DOWNLOAD FUNCTION
// ==========================
export async function getUrl(originalUrl) {
  // Prevent concurrent requests from creating multiple browsers
  if (isProcessing()) {
    console.log("⏳ Another request is being processed, waiting...");
    while (isProcessing()) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  setProcessing(true);

  try {
    // Check browser health ONCE at the start
    await ensureBrowserHealth();

    const globalBrowser = getBrowser();
    const globalPage = getPage();

    if (!globalBrowser || !globalPage) {
      throw new Error("Browser not initialized");
    }

    // Transform the URL to use pakseotools proxy
    const url = transformFreepikUrl(originalUrl);

    if (!url) {
      throw new Error("Invalid URL provided");
    }

    // Get list of files before download
    const filesBefore = new Set(fs.readdirSync(DOWNLOADS_DIR));

    const success = await navigateToUrl(url);
    if (!success) throw new Error("Failed to navigate");

    // Close cookie popup if any
    try {
      await globalPage.click("button[aria-label='Accept all']", {
        timeout: 3000,
      });
      console.log("🍪 Cookie popup closed");
    } catch {}

    // Wait for page to fully load
    console.log("⏳ Waiting for page content to load...");
    await new Promise((r) => setTimeout(r, 3000));

    // Wait for and click the download button
    console.log("🔍 Looking for download button...");

    // Extended selector list for pakseotools
    const downloadSelectors = [
      "button[data-cy='download-button']",
      "a[download]",
      "button[data-testid='download-button']",
      "button.download-button",
      ".download-btn",
      "[class*='download']",
      "a.download",
      ".btn-download",
      "#download-button",
    ];

    let button = null;

    // Try each selector
    for (const selector of downloadSelectors) {
      try {
        button = await globalPage.waitForSelector(selector, {
          visible: true,
          timeout: 5000,
        });
        if (button) {
          console.log(`✅ Found button with selector: ${selector}`);
          break;
        }
      } catch {
        // Continue to next selector
      }
    }

    // If no button found, try a more general approach
    if (!button) {
      console.log("🔍 Trying general button search...");
      button = await globalPage.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll("button, a"));
        return buttons.find(
          (btn) =>
            btn.textContent?.toLowerCase().includes("download") ||
            btn.className?.toLowerCase().includes("download")
        );
      });

      const buttonValue = await button.jsonValue().catch(() => null);
      if (!buttonValue) {
        throw new Error("Download button not found");
      }
    }

    // Get button text for logging
    const buttonText = await globalPage
      .evaluate((el) => el?.textContent || "Unknown", button)
      .catch(() => "Unknown");

    console.log(`⬇️ Clicking download button: "${buttonText?.trim()}"`);

    await button.click();

    // Wait for download to start
    console.log("⏳ Waiting for download to start...");
    await new Promise((r) => setTimeout(r, 3000));

    // Wait for download to complete
    console.log("⏳ Waiting for download to complete...");
    const downloadedFile = await waitForDownload(
      DOWNLOADS_DIR,
      filesBefore,
      TIMEOUTS.downloadComplete
    );

    if (!downloadedFile) {
      throw new Error("Download timed out or failed");
    }

    // Rename file with unique ID to prevent conflicts
    const uniqueId = uuidv4();
    const ext = path.extname(downloadedFile);
    const originalName = path.basename(downloadedFile, ext);
    const newFileName = `${uniqueId}${ext}`;

    const oldPath = path.join(DOWNLOADS_DIR, downloadedFile);
    const newPath = path.join(DOWNLOADS_DIR, newFileName);

    fs.renameSync(oldPath, newPath);
    console.log(`📁 File renamed: ${downloadedFile} → ${newFileName}`);

    // Schedule file for cleanup
    scheduleFileCleanup(newFileName);

    const fileSize = formatBytes(fs.statSync(newPath).size);

    // ✅ FIX: Properly encode URL parameters for WhatsApp
    const downloadUrl = buildDownloadUrl({
      filename: originalName + ext,
      size: fileSize,
      serverFile: newFileName,
    });

    return {
      url: downloadUrl,
      filename: originalName + ext,
      size: fileSize,
      expiresIn: `${FILE_EXPIRY_TIME / 60000} minutes`,
      originalUrl: originalUrl,
      proxyUrl: url,
    };
  } catch (err) {
    console.error("❌ Error in getUrl:", err.message);

    try {
      const globalPage = getPage();
      if (globalPage) {
        await globalPage.screenshot({ path: "debug.png", fullPage: true });
        console.log("📸 Debug screenshot saved");

        const currentUrl = await globalPage.url();
        console.log(`📍 Current page URL: ${currentUrl}`);

        const pageTitle = await globalPage.title();
        console.log(`📄 Page title: ${pageTitle}`);
      }
    } catch (e) {
      console.log("⚠️ Could not save debug screenshot");
    }

    return null;
  } finally {
    setProcessing(false);
  }
}

// ==========================
// ✅ NEW: BUILD DOWNLOAD URL (Properly encoded for WhatsApp)
// ==========================
function buildDownloadUrl({ filename, size, serverFile }) {
  // Option 1: Use frontend download page with encoded params
  const encodedFilename = encodeURIComponent(filename);
  const encodedSize = encodeURIComponent(size);
  const encodedRedirect = encodeURIComponent(
    `${SERVER_URL}/download/${serverFile}`
  );

  const downloadUrl = `${FRONTEND_URL}/download?name=${encodedFilename}&size=${encodedSize}&redirect=${encodedRedirect}`;

  console.log(`🔗 Generated download URL: ${downloadUrl}`);

  return downloadUrl;
}
