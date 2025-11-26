import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { MAX_QR_RETRIES, QR_DEBOUNCE_MS, URL_CONFIG } from "../config/index.js";
import {
  NOT_REGISTERED_MESSAGE,
  getSubscriptionErrorMessage,
} from "../config/messages.js";
import { checkSubscription, createRequest } from "./subscriptionService.js";
import { getUrl } from "./downloadService.js";
import { initGlobalBrowser } from "./browserService.js";
import { isValidFreepikUrl, extractUrlFromMessage } from "../utils/urlUtils.js";
import {
  isAdmin,
  parseCommand,
  executeCommand,
} from "./adminCommandService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ==========================
// WHATSAPP CLIENT STATE
// ==========================
let qrRetries = 0;
let lastQRTime = 0;

// Store bot's alternative IDs (LIDs, etc.)
let botAlternateIds = new Set();

// ==========================
// WHATSAPP CLIENT SETUP
// ==========================
export const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: "./",
    clientId: "freepik-bot",
  }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-zygote",
      "--single-process",
      "--disable-gpu",
    ],
  },
  qrMaxRetries: 5,
  authTimeoutMs: 120000,
  takeoverOnConflict: true,
  takeoverTimeoutMs: 10000,
});

// ==========================
// QR CODE HANDLER
// ==========================
client.on("qr", (qr) => {
  const now = Date.now();

  if (now - lastQRTime < QR_DEBOUNCE_MS) {
    console.log("⏳ QR refresh too fast, skipping...");
    return;
  }

  lastQRTime = now;
  qrRetries++;

  console.clear();
  console.log("\n" + "=".repeat(50));
  console.log(`📱 SCAN QR CODE WITH WHATSAPP`);
  console.log(`   Attempt ${qrRetries}/${MAX_QR_RETRIES}`);
  console.log("=".repeat(50) + "\n");

  qrcode.generate(qr, { small: true });

  console.log("\n" + "=".repeat(50));
  console.log("⏰ QR code valid for ~60 seconds");
  console.log("📲 Open WhatsApp > Settings > Linked Devices > Link a Device");
  console.log("=".repeat(50) + "\n");

  if (qrRetries >= MAX_QR_RETRIES) {
    console.log("❌ Max QR retries reached. Restarting in 10 seconds...");
    client.destroy().then(() => {
      setTimeout(() => {
        qrRetries = 0;
        lastQRTime = 0;
        client.initialize();
      }, 10000);
    });
  }
});

// ==========================
// LOADING SCREEN
// ==========================
client.on("loading_screen", (percent, message) => {
  console.log(`⏳ Loading: ${percent}% - ${message}`);
});

// ==========================
// AUTHENTICATED
// ==========================
client.on("authenticated", () => {
  console.log("\n✅ Authentication successful!");
  console.log("🔐 Session saved. You won't need to scan QR again.\n");
  qrRetries = 0;
  lastQRTime = 0;
});

// ==========================
// AUTH FAILURE
// ==========================
client.on("auth_failure", async (msg) => {
  console.error("\n❌ Authentication failed:", msg);
  console.log("🧹 Cleaning up session files...");

  try {
    const sessionPath = path.join(__dirname, "..", "..", "session");
    const cachePath = path.join(__dirname, "..", "..", ".wwebjs_cache");

    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      console.log("   Deleted: session folder");
    }
    if (fs.existsSync(cachePath)) {
      fs.rmSync(cachePath, { recursive: true, force: true });
      console.log("   Deleted: .wwebjs_cache folder");
    }
  } catch (e) {
    console.error("   Error cleaning up:", e.message);
  }

  console.log("🔄 Restarting in 5 seconds...\n");
  setTimeout(() => {
    qrRetries = 0;
    lastQRTime = 0;
    client.initialize();
  }, 5000);
});

// ==========================
// DISCONNECTED
// ==========================
client.on("disconnected", (reason) => {
  console.log("\n🔌 Client disconnected:", reason);
  console.log("🔄 Attempting to reconnect in 5 seconds...\n");

  setTimeout(() => {
    qrRetries = 0;
    lastQRTime = 0;
    client.initialize();
  }, 5000);
});

// ==========================
// READY
// ==========================
client.on("ready", async () => {
  console.log("✅ WhatsApp Bot is ready!");

  const info = client.info;

  console.log("=".repeat(50));
  console.log("🤖 BOT IDENTIFICATION INFO:");
  console.log("=".repeat(50));
  console.log("📞 Phone Number (wid.user):", info.wid.user);
  console.log("🆔 Full ID (_serialized):", info.wid._serialized);
  console.log("=".repeat(50));

  console.log("\n⚠️  USE THIS AS YOUR STORED_ID:", info.wid.user);
  console.log("\n");

  console.log("🔗 PROXY CONFIGURATION:");
  console.log(`   Original Domain: ${URL_CONFIG.originalDomain}`);
  console.log(`   Proxy Domain: ${URL_CONFIG.proxyDomain}`);
  console.log(`   Proxy Base URL: ${URL_CONFIG.proxyBaseUrl}`);
  console.log("\n");

  // Initialize browser when WhatsApp is ready
  console.log("🌐 Initializing download browser...");
  await initGlobalBrowser();
});

// ==========================
// HELPER: Extract WhatsApp ID from various formats
// ==========================
function extractWhatsAppId(id) {
  if (!id) return null;

  if (typeof id === "object") {
    // Handle ContactId objects - prioritize _serialized, then user, then lid
    const serialized = id._serialized || "";
    const user = id.user || "";
    const lid = id.lid || "";

    // Get the ID part before @ symbol
    if (serialized) {
      return serialized.split("@")[0];
    }
    if (lid) {
      return lid;
    }
    if (user) {
      return user;
    }
    return String(id).split("@")[0];
  }

  // Handle string format
  return String(id).split("@")[0];
}

// ==========================
// HELPER: Get sender's WhatsApp ID (LID or phone number)
// ==========================
function getSenderWhatsAppId(msg) {
  try {
    // Try to get from participant (for group messages)
    if (msg.id && msg.id.participant) {
      if (typeof msg.id.participant === "object") {
        return extractWhatsAppId(msg.id.participant);
      }
      return msg.id.participant.split("@")[0];
    }

    // Try author
    if (msg.author) {
      if (typeof msg.author === "object") {
        return extractWhatsAppId(msg.author);
      }
      return msg.author.split("@")[0];
    }

    // Fallback to from
    return msg.from.split("@")[0];
  } catch (err) {
    console.log("⚠️ Error extracting sender ID:", err.message);
    return msg.author?.split("@")[0] || msg.from.split("@")[0];
  }
}

// ==========================
// HELPER: Check if bot is the first/intended mention
// ==========================
function isBotTheFirstMention(body, mentionedIds, botNumber, botAlternateIds) {
  const firstMentionMatch = body.match(/@(\d+)/);
  if (!firstMentionMatch) return false;

  const firstMention = firstMentionMatch[1];

  return (
    firstMention === botNumber ||
    botAlternateIds.has(firstMention) ||
    mentionedIds.includes(firstMention)
  );
}

// ==========================
// MESSAGE HANDLER
// ==========================
client.on("message", async (msg) => {
  console.log("\n" + "=".repeat(50));
  console.log("📩 New message received:", msg.body);

  if (!msg.from.endsWith("@g.us")) {
    console.log("❌ Not a group message, ignoring");
    return;
  }

  const botNumber = client.info.wid.user;
  const botLid = client.info.wid.lid || "";
  const body = msg.body || "";

  // ✅ Get sender's WhatsApp ID (could be LID or phone number)
  const senderWaId = getSenderWhatsAppId(msg);

  // ✅ IMPROVED: Extract mentioned IDs properly - keep original format
  const mentionedIdsRaw = msg.mentionedIds || [];

  // Store both cleaned (for matching) and original (for storage) IDs
  const mentionedIdsInfo = mentionedIdsRaw.map((id) => {
    const originalId = extractWhatsAppId(id);
    const cleanedId = originalId.replace(/\D/g, ""); // Only digits for matching
    return {
      original: originalId, // e.g., "137804394799233" - for storage
      cleaned: cleanedId, // e.g., "137804394799233" - for matching
      raw: id, // Original object/string
    };
  });

  const mentionedIds = mentionedIdsInfo.map((info) => info.cleaned);
  const mentionedIdsOriginal = mentionedIdsInfo.map((info) => info.original);

  // ✅ Extract @ mentions directly from message body
  const bodyMentions =
    body.match(/@(\d+)/g)?.map((m) => m.replace("@", "")) || [];

  console.log("🔍 DEBUG INFO:");
  console.log("   Bot Number:", botNumber);
  console.log("   Bot LID:", botLid || "N/A");
  console.log("   Bot Alternate IDs:", [...botAlternateIds]);
  console.log("   📱 Sender WhatsApp ID:", senderWaId);
  console.log("   Mentioned IDs (raw):", JSON.stringify(mentionedIdsRaw));
  console.log("   Mentioned IDs (original):", mentionedIdsOriginal);
  console.log("   Mentioned IDs (cleaned):", mentionedIds);
  console.log("   Body @ Mentions:", bodyMentions);
  console.log("   Is Admin:", isAdmin(senderWaId));

  // ✅ IMPROVED: Multiple methods to detect bot mention
  const isBotMentioned =
    mentionedIds.includes(botNumber) ||
    body.includes(`@${botNumber}`) ||
    bodyMentions.includes(botNumber) ||
    (botLid && mentionedIds.includes(botLid.replace(/\D/g, ""))) ||
    mentionedIds.some((id) => botAlternateIds.has(id)) ||
    (mentionedIds.length > 0 &&
      bodyMentions.length > 0 &&
      mentionedIds.some((id) => bodyMentions.includes(id)) &&
      isBotTheFirstMention(body, mentionedIds, botNumber, botAlternateIds));

  console.log("   Is Bot Mentioned:", isBotMentioned);
  console.log("=".repeat(50) + "\n");

  // ✅ Learn bot's alternate ID from successful interactions
  if (isBotMentioned && mentionedIds.length > 0) {
    mentionedIds.forEach((id) => {
      if (id !== botNumber && bodyMentions.includes(id)) {
        botAlternateIds.add(id);
        console.log("📝 Learned new bot alternate ID:", id);
      }
    });
  }

  if (!isBotMentioned) {
    console.log("❌ Bot not mentioned, ignoring message");
    return;
  }

  const randomDelay = () =>
    new Promise((r) => setTimeout(r, 2000 + Math.random() * 1000));

  await randomDelay();

  const mentionTarget = msg.id?.participant || msg.author || msg.from;

  // ==========================
  // ✅ CHECK FOR ADMIN COMMANDS FIRST
  // ==========================
  if (isAdmin(senderWaId)) {
    console.log("👑 Admin detected, checking for commands...");

    // ✅ Pass ORIGINAL IDs (with full WhatsApp ID) for user registration
    const parsedCommand = parseCommand(
      body,
      mentionedIdsOriginal,
      mentionedIdsInfo
    );
    console.log("Parsed Command:", parsedCommand);

    if (parsedCommand) {
      console.log(`🔧 Admin command detected: ${parsedCommand.command}`);

      try {
        await msg.react("⚙️");
      } catch (e) {}

      const result = await executeCommand(
        parsedCommand.command,
        parsedCommand.match,
        senderWaId
      );

      console.log("📤 Command result:", result);

      // Build mentions array
      const mentions = [mentionTarget];
      if (result.mentionUser) {
        // Find the original serialized ID for mentioning
        const userInfo = mentionedIdsInfo.find(
          (info) =>
            info.original === result.mentionUser ||
            info.cleaned === result.mentionUser
        );
        if (userInfo && userInfo.raw) {
          mentions.push(
            userInfo.raw._serialized || `${result.mentionUser}@c.us`
          );
        } else {
          mentions.push(`${result.mentionUser}@c.us`);
        }
      }

      try {
        await msg.react(result.success ? "✅" : "❌");
      } catch (e) {}

      await client.sendMessage(msg.from, result.message, { mentions });

      return;
    }
  }

  // ==========================
  // ✅ REGULAR USER FLOW - CHECK FOR DOWNLOAD REQUESTS
  // ==========================
  try {
    await msg.react("👍");
  } catch (e) {
    console.log("⚠️ Could not react to message");
  }

  const link = extractUrlFromMessage(msg.body);

  if (!link) {
    if (isAdmin(senderWaId)) {
      const helpResult = await executeCommand("help", [], senderWaId);
      return await msg.reply(
        `👑 *Admin Mode*\n\n${helpResult.message}\n\n` +
          `Or send a Freepik link to download.`,
        msg.from,
        { mentions: [mentionTarget] }
      );
    }

    return await msg.reply(
      `@${senderWaId}! Please mention me with a valid Freepik link.`,
      msg.from,
      { mentions: [mentionTarget] }
    );
  }

  if (!isValidFreepikUrl(link)) {
    return await msg.reply(
      `@${senderWaId}! Please provide a valid Freepik.com URL.\n\nExample: https://www.freepik.com/free-psd/example_123456.htm`,
      msg.from,
      { mentions: [mentionTarget] }
    );
  }

  // ✅ Use WhatsApp ID for subscription check
  console.log("🔍 Checking subscription for:", senderWaId);
  const sub = await checkSubscription(senderWaId);
  console.log("📊 Subscription result:", sub);

  if (!sub.valid) {
    const msgText = getSubscriptionErrorMessage(senderWaId, sub.reason, sub);
    return await msg.reply(msgText, msg.from, {
      mentions: [mentionTarget],
    });
  }

  try {
    await randomDelay();

    try {
      await msg.react("⏳");
    } catch (e) {}

    await client.sendMessage(
      msg.from,
      `⏳ @${senderWaId}, processing your request...\nThis may take up to 2-3 minutes due to file size.`,
      { mentions: [mentionTarget] }
    );

    const result = await getUrl(link);

    if (result && result.url) {
      await createRequest(sub.userId);

      try {
        await msg.react("✅");
      } catch (e) {}

      const successMessage =
        `✅ Hey @${senderWaId}, here's your download!\n\n` +
        `📁 *File:* ${result.filename}\n` +
        `📊 *Size:* ${result.size}\n` +
        `⏰ *Expires in:* ${result.expiresIn}\n` +
        `📈 *Usage:* ${sub.requestsToday + 1}/${sub.limit || "∞"} today\n\n` +
        `🔗 *Download Link:*\n${result.url}`;

      await client.sendMessage(msg.from, successMessage, {
        mentions: [mentionTarget],
      });
    } else {
      try {
        await msg.react("❌");
      } catch (e) {}

      await msg.reply(
        `⚠️ @${senderWaId}, couldn't fetch the download. Please try again or check if the link is valid.`,
        msg.from,
        { mentions: [mentionTarget] }
      );
    }
  } catch (err) {
    console.error("❌ Error processing request:", err);

    try {
      await msg.react("❌");
    } catch (e) {}

    await msg.reply(
      `❌ Sorry @${senderWaId}, I couldn't process your link. Error: ${err.message}`,
      msg.from,
      { mentions: [mentionTarget] }
    );
  }
});

// ==========================
// HELPER FUNCTIONS
// ==========================
export function getQrRetries() {
  return qrRetries;
}

export function getWhatsAppStatus() {
  try {
    const info = client.info;
    return {
      status: "connected",
      phoneNumber: info?.wid?.user || "Not available",
      qrRetries: qrRetries,
    };
  } catch (err) {
    return {
      status: "disconnected",
      qrRetries: qrRetries,
    };
  }
}

export async function resetWhatsAppSession() {
  await client.logout();
  await client.destroy();

  const sessionPath = path.join(__dirname, "..", "..", "session");
  const cachePath = path.join(__dirname, "..", "..", ".wwebjs_cache");

  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
  }
  if (fs.existsSync(cachePath)) {
    fs.rmSync(cachePath, { recursive: true, force: true });
  }
}

export function initializeWhatsApp() {
  console.log("📱 Initializing WhatsApp client...\n");
  client.initialize();
}

export async function destroyWhatsApp() {
  console.log("📱 Destroying WhatsApp client...");
  try {
    await client.destroy();
  } catch (e) {
    console.log("⚠️ Error destroying WhatsApp client:", e.message);
  }
}
