import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import {
  ADMIN_PASS,
  DOWNLOADS_DIR,
  TIMEOUTS,
  URL_CONFIG,
  FILE_EXPIRY_TIME,
} from "../config/index.js";
import {
  getBrowserStatus,
  isProcessing,
  forceReLogin,
  getLoginStatus,
} from "../services/browserService.js";
import {
  getWhatsAppStatus,
  resetWhatsAppSession,
  getQrRetries,
} from "../services/whatsappService.js";
import { getFilesList, fileRegistry } from "../utils/fileUtils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// ==========================
// BROWSER STATUS
// ==========================
router.get("/browser-status", async (req, res) => {
  try {
    const status = await getBrowserStatus();
    res.json({
      ...status,
      isProcessingRequest: isProcessing(),
      downloadsDir: DOWNLOADS_DIR,
      activeFiles: fileRegistry.size,
      proxyDomain: URL_CONFIG.proxyDomain,
      timeouts: TIMEOUTS,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ==========================
// ✅ FORCE RE-LOGIN
// ==========================
router.post("/force-login", async (req, res) => {
  const { password } = req.body;

  if (password !== ADMIN_PASS) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    console.log("🔄 Force re-login requested...");
    const success = await forceReLogin();

    res.json({
      success,
      message: success ? "Re-login successful" : "Re-login failed",
      isLoggedIn: getLoginStatus(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================
// ✅ LOGIN STATUS
// ==========================
router.get("/login-status", (req, res) => {
  res.json({
    isLoggedIn: getLoginStatus(),
  });
});

// ==========================
// FILES LIST
// ==========================
router.get("/files", (req, res) => {
  try {
    const files = getFilesList();
    res.json({ files, total: files.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================
// WHATSAPP STATUS
// ==========================
router.get("/whatsapp-status", (req, res) => {
  res.json(getWhatsAppStatus());
});

// ==========================
// UPDATE TIMEOUTS
// ==========================
router.post("/update-timeouts", (req, res) => {
  const { password, timeouts: newTimeouts } = req.body;

  if (password !== ADMIN_PASS) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (newTimeouts) {
    Object.assign(TIMEOUTS, newTimeouts);
    console.log("⏱️ Timeouts updated:", TIMEOUTS);
  }

  res.json({ success: true, timeouts: TIMEOUTS });
});

// ==========================
// GET CONFIG
// ==========================
router.get("/config", (req, res) => {
  res.json({
    urlConfig: URL_CONFIG,
    timeouts: TIMEOUTS,
    fileExpiry: FILE_EXPIRY_TIME,
    downloadsDir: DOWNLOADS_DIR,
  });
});

// ==========================
// RESET WHATSAPP
// ==========================
router.post("/reset-whatsapp", async (req, res) => {
  const { password } = req.body;

  if (password !== ADMIN_PASS) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    console.log("🔄 Resetting WhatsApp session...");
    await resetWhatsAppSession();

    res.json({
      success: true,
      message: "Session reset. Restart the server to scan QR again.",
    });

    setTimeout(() => process.exit(0), 1000);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================
// LOGIN
// ==========================
router.post("/login", (req, res) => {
  const { password } = req.body;
  res.sendStatus(password === ADMIN_PASS ? 200 : 401);
});

export default router;
