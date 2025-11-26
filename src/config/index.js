import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================
// SERVER CONFIGURATION
// ==========================
export const PORT = process.env.PORT || 3020;
export const ADMIN_PASS = process.env.ADMIN_PASS || "9832";
export const SERVER_URL = process.env.SERVER_URL || `http://localhost:${PORT}`;
export const FRONTEND_URL = process.env.FRONTEND_URL || `http://localhost:3000`;

// ==========================
// ✅ ADMIN PHONE NUMBERS (can register/manage users)
// ==========================
export const ADMIN_NUMBERS = process.env.ADMIN_NUMBERS
  ? process.env.ADMIN_NUMBERS.split(",").map((n) => n.trim())
  : ["923331950415", "923145031544"]; // Add your admin numbers here

// ==========================
// ✅ SUBSCRIPTION PLANS
// ==========================
export const SUBSCRIPTION_PLANS = {
  BASIC: {
    name: "BASIC",
    dailyLimit: 10,
    price: 299,
  },
  STANDARD: {
    name: "STANDARD",
    dailyLimit: 20,
    price: 349,
  },
  PREMIUM: {
    name: "PREMIUM",
    dailyLimit: 30,
    price: 379,
  },
};

// ==========================
// PAKSEOTOOLS LOGIN CREDENTIALS
// ==========================
export const PAKSEOTOOLS_CREDENTIALS = {
  email: process.env.PAKSEOTOOLS_EMAIL || "your-email@example.com",
  password: process.env.PAKSEOTOOLS_PASSWORD || "your-password",
  loginUrl: "https://app.pakseotools.com/login",
};

// ==========================
// FILE CLEANUP SETTINGS
// ==========================
export const FILE_EXPIRY_TIME = 1 * 60 * 1000; // 1 minute
export const CLEANUP_INTERVAL = 5 * 60 * 1000; // Check every 5 minutes

// ==========================
// TIMEOUT SETTINGS
// ==========================
export const TIMEOUTS = {
  navigation: 120000,
  downloadButton: 60000,
  downloadComplete: 180000,
  pageLoad: 90000,
  initialWait: 5000,
  retryDelay: 3000,
  loginWait: 10000,
};

// ==========================
// URL TRANSFORMATION CONFIG
// ==========================
export const URL_CONFIG = {
  originalDomain: "freepik.com",
  proxyDomain: "freepik.pakseotools.com",
  proxyBaseUrl: "https://freepik.pakseotools.com",
};

// ==========================
// DIRECTORIES
// ==========================
export const ROOT_DIR = path.join(__dirname, "..");
export const DOWNLOADS_DIR = path.join(ROOT_DIR, "downloads");

// ==========================
// WHATSAPP CONFIG
// ==========================
export const QR_DEBOUNCE_MS = 3000;
export const MAX_QR_RETRIES = 5;
