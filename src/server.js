import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Config imports
import {
  PORT,
  SERVER_URL,
  DOWNLOADS_DIR,
  FILE_EXPIRY_TIME,
  TIMEOUTS,
  URL_CONFIG,
} from "./config/index.js";

// Service imports
import { closeBrowser } from "./services/browserService.js";
import {
  initializeWhatsApp,
  destroyWhatsApp,
} from "./services/whatsappService.js";

// Utility imports
import {
  initDownloadsDir,
  startPeriodicCleanup,
  cleanAllTempFiles,
  fileRegistry,
} from "./utils/fileUtils.js";

// Route imports
import apiRoutes from "./routes/apiRoutes.js";
import userRoutes from "./routes/userRoutes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================
// EXPRESS APP SETUP
// ==========================
const app = express();

// Middleware
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// ==========================
// INITIALIZE DIRECTORIES
// ==========================
initDownloadsDir();

// ==========================
// START PERIODIC CLEANUP
// ==========================
startPeriodicCleanup();

// ==========================
// DOWNLOAD FILE SERVING
// ==========================
app.get("/download/:filename", (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(DOWNLOADS_DIR, filename);

  // Security check - prevent directory traversal
  if (!filePath.startsWith(DOWNLOADS_DIR)) {
    return res.status(403).send("Access denied");
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found or expired");
  }

  // Mark as downloaded
  if (fileRegistry.has(filename)) {
    const info = fileRegistry.get(filename);
    info.downloaded = true;
  }

  // Send file for download
  res.download(filePath, (err) => {
    if (err) {
      console.error("❌ Error sending file:", err);
    } else {
      console.log(`✅ File downloaded: ${filename}`);
    }
  });
});

// ==========================
// ROUTES
// ==========================
app.get("/home", (req, res) => {
  res.send("Hello! Express server is working 🚀");
});

app.use("/api", apiRoutes);
app.use("/users", userRoutes);

// ==========================
// GRACEFUL SHUTDOWN
// ==========================
async function gracefulShutdown() {
  console.log("\n🔄 Shutting down gracefully...");

  console.log("🧹 Cleaning up temporary files...");
  cleanAllTempFiles();

  await closeBrowser();
  await destroyWhatsApp();

  console.log("👋 Goodbye!\n");
  process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
});

// ==========================
// START SERVER
// ==========================
app.listen(PORT, () => {
  console.log("\n" + "=".repeat(50));
  console.log(`🚀 EXPRESS SERVER STARTED`);
  console.log("=".repeat(50));
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📁 Downloads: ${SERVER_URL}/download/`);
  console.log(`⏰ File expiry: ${FILE_EXPIRY_TIME / 60000} minutes`);
  console.log("=".repeat(50));
  console.log(`🔗 PROXY CONFIGURATION:`);
  console.log(`   Original: ${URL_CONFIG.originalDomain}`);
  console.log(`   Proxy: ${URL_CONFIG.proxyDomain}`);
  console.log("=".repeat(50));
  console.log(`⏱️ TIMEOUT SETTINGS:`);
  console.log(`   Navigation: ${TIMEOUTS.navigation / 1000}s`);
  console.log(`   Download Button: ${TIMEOUTS.downloadButton / 1000}s`);
  console.log(`   Download Complete: ${TIMEOUTS.downloadComplete / 1000}s`);
  console.log("=".repeat(50) + "\n");
});

// ==========================
// INITIALIZE WHATSAPP
// ==========================
initializeWhatsApp();
