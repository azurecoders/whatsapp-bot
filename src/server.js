import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import puppeteer from "puppeteer";
import userRoutes from "./routes/userRoutes.js";
import prisma from "../src/db.js";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

// ✅ Global browser and page management
let globalBrowser = null;
let globalPage = null;
let isBrowserInitializing = false;

const app = express();
const PORT = 3020;
const ADMIN_PASS = "9832";

// ==========================
// MESSAGES
// ==========================
const RENEWAL_MESSAGE = `Assalam-o-Alaikum, Dear Member,

Your subscription to “Freepik Premium by Mubashir Awan” is about to expire. To continue accessing our files, please renew your subscription.

Plans Available:
✨ Basic – 10 files/day | 299 PKR
✨ Standard (Most Popular) 20 files/day | 349 PKR
✨ Premium – 30 files/day | 379 PKR

Payment Details:
JazzCash: 03319818561
Name: Mubashir Mehmood Awan

Note: Payment will only be accepted with a valid screenshot.

Admin Mubashir Awan
Thank you for being part of our community.`;

const NOT_REGISTERED_MESSAGE = `Assalam-o-Alaikum, Dear User,

You are not registered in our system. Please contact the admin to get registered and start using our services.

If you wish to join our premium plans, please see the details below:

Your subscription to “Freepik Premium by Mubashir Awan” gives you access to high-quality premium files.

Plans Available:
✨ Basic – 10 files/day | 299 PKR
✨ Standard (Most Popular) – 20 files/day | 349 PKR
✨ Premium – 30 files/day | 379 PKR

Payment Details:
JazzCash: 03319818561
Name: Mubashir Mehmood Awan

Note: Payment will only be accepted with a valid screenshot.

Please contact Admin Mubashir Awan to complete your registration.

Thank you for your interest in our community.`;

// ==========================
// EXPRESS SETUP
// ==========================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// ==========================
// GLOBAL BROWSER INITIALIZATION
// ==========================
async function initGlobalBrowser() {
  if (isBrowserInitializing) {
    while (isBrowserInitializing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return;
  }

  if (globalBrowser && globalPage) return;

  try {
    isBrowserInitializing = true;
    console.log("🔄 Initializing global browser...");

    globalBrowser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--disable-accelerated-2d-canvas",
        "--no-zygote",
        "--single-process",
        "--disable-gpu",
        "--window-size=1280,800",
      ],
    });

    globalPage = await globalBrowser.newPage();

    await globalPage.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/118.0.5993.88 Safari/537.36"
    );

    await globalPage.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
    });

    await globalPage.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });

    const url = "https://www.freepik.com/";
    console.log(`🌐 Opening Freepik homepage: ${url}`);
    await globalPage.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    console.log("✅ Global browser initialized successfully");
  } catch (error) {
    console.error("❌ Error initializing global browser:", error);
    globalBrowser = null;
    globalPage = null;
  } finally {
    isBrowserInitializing = false;
  }
}

// ==========================
// BROWSER HEALTH CHECK
// ==========================
async function ensureBrowserHealth() {
  try {
    if (!globalBrowser || !globalPage) {
      await initGlobalBrowser();
      return;
    }

    if (globalBrowser.isConnected()) {
      await globalPage.evaluate(() => document.readyState);
    } else {
      throw new Error("Browser disconnected");
    }
  } catch (error) {
    console.log("🔧 Browser needs reinitialization:", error.message);
    globalBrowser = null;
    globalPage = null;
    await initGlobalBrowser();
  }
}

// ==========================
// URL NAVIGATION
// ==========================
async function navigateToUrl(url) {
  await ensureBrowserHealth();
  try {
    console.log(`🔄 Navigating to: ${url}`);
    await globalPage.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    await globalPage.setViewport({ width: 1280, height: 800 });
    await globalPage.waitForTimeout(3000);
    return true;
  } catch (error) {
    console.error("❌ Navigation error:", error);
    return false;
  }
}

// ==========================
// FIXED getUrl FUNCTION (HEADLESS SAFE)
// ==========================
async function getUrl(url) {
  await ensureBrowserHealth();

  try {
    const success = await navigateToUrl(url);
    if (!success) throw new Error("Failed to navigate");

    await globalPage.setRequestInterception(true);

    const urlPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timeout: Download URL not found within 30 seconds"));
      }, 30000);

      const handler = async (req) => {
        const reqUrl = req.url();
        if (
          reqUrl.includes("downloadscdn5.freepik.com") ||
          reqUrl.includes("downloadscdn6.freepik.com") ||
          reqUrl.includes("videocdn.cdnpk.net")
        ) {
          console.log("✅ Found Download URL:", reqUrl);
          clearTimeout(timeout);
          globalPage.off("request", handler);
          resolve(reqUrl);
        } else req.continue();
      };

      globalPage.on("request", handler);
    });

    // Close cookie popup if any
    try {
      await globalPage.click("button[aria-label='Accept all']", { timeout: 5000 });
      console.log("🍪 Cookie popup closed");
    } catch {}

    // Wait and click the download button
    const button = await globalPage.waitForSelector(
      "button[data-cy='download-button'], a[download], button[data-testid='download-button']",
      { visible: true, timeout: 30000 }
    );
    await button.click();
    console.log("⬇️ Download button clicked...");

    const foundUrl = await urlPromise;
    await globalPage.setRequestInterception(false);
    return foundUrl;
  } catch (err) {
    console.error("❌ Error in getUrl:", err);
    await globalPage.screenshot({ path: "debug.png", fullPage: true });
    await globalPage.setRequestInterception(false);
    return null;
  }
}

// ==========================
// SUBSCRIPTION CHECKING
// ==========================
async function checkSubscription(wId) {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const user = await prisma.user.findFirst({
      where: { wId },
      include: {
        subscription: true,
        Request: { where: { date: { gte: start, lt: end } } },
      },
    });

    if (!user)
      return { valid: false, reason: "User not found", userId: null, requestsToday: 0, limit: 0 };

    if (!user.subscription)
      return { valid: false, reason: "No active subscription", userId: user.id, requestsToday: user.Request.length, limit: 0 };

    if (user.subscription.expiresAt < new Date())
      return { valid: false, reason: "Subscription expired", userId: user.id, requestsToday: user.Request.length, limit: 0 };

    const plan = user.subscription.plan;
    const requestsToday = user.Request.length;
    const limits = { BASIC: 10, STANDARD: 20, PREMIUM: 30 };
    const limit = limits[plan] || 0;

    if (requestsToday >= limit)
      return { valid: false, reason: "Daily limit exceeded", userId: user.id, requestsToday, limit };

    return { valid: true, reason: "Valid subscription", userId: user.id, requestsToday, limit, subscription: plan };
  } catch (err) {
    console.error("❌ Error checking subscription:", err);
    return { valid: false, reason: "Database error", userId: null, requestsToday: 0, limit: 0 };
  }
}

// ==========================
// CREATE REQUEST RECORD
// ==========================
async function createRequest(userId) {
  try {
    const req = await prisma.request.create({ data: { userId } });
    console.log("✅ Request created:", req);
    return req;
  } catch (err) {
    console.error("❌ Error creating request:", err);
  }
}

// ==========================
// WHATSAPP BOT CONFIG
// ==========================
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./" }),
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
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  console.log("📱 Scan this QR with WhatsApp");
});

client.on("ready", async () => {
  console.log("✅ WhatsApp Bot is ready!");
  const info = await client.info;
  console.log("🤖 Bot Info:", info);
  console.log("📞 Bot WhatsApp ID:", info.wid._serialized);
  console.log("📱 Bot phone number:", info.wid.user);

  await initGlobalBrowser();
});

// ==========================
// MESSAGE HANDLER
// ==========================
client.on("message", async (msg) => {
  console.log("📩 New message received:", msg.body);
  if (!msg.from.endsWith("@g.us")) return;

  const STORED_ID = "84868620914800";
  const botNumber = client.info.wid.user;
  const mentionedIds = msg.mentionedIds.map((id) => id.split("@")[0]);
  const body = msg.body?.toLowerCase() || "";
  const isBotMentioned =
    mentionedIds.includes(botNumber) ||
    mentionedIds.includes(STORED_ID) ||
    body.includes(botNumber) ||
    body.includes(STORED_ID);

  if (!isBotMentioned) return;

  const randomDelay = () => new Promise((r) => setTimeout(r, 2000 + Math.random() * 1000));
  await randomDelay();
  await msg.react("👍");

  const senderContact = await msg.getContact();
  const urlMatch = msg.body.match(/https?:\/\/[^\s]+/);
  if (!urlMatch)
    return await msg.reply(
      `@${senderContact.number}! Please mention me with a valid link.`,
      msg.from,
      { mentions: [senderContact] }
    );

  const link = urlMatch[0];
  const sub = await checkSubscription(senderContact.number);
  if (!sub.valid) {
    let msgText = `@${senderContact.number}! `;
    switch (sub.reason) {
      case "User not found": msgText += NOT_REGISTERED_MESSAGE; break;
      case "No active subscription": msgText += "You don't have an active subscription."; break;
      case "Daily limit exceeded": msgText += `Limit ${sub.limit} reached (${sub.requestsToday} used).`; break;
      case "Subscription expired": msgText += "Your subscription expired."; break;
      default: msgText += "Subscription check failed."; break;
    }
    return await msg.reply(msgText, msg.from, { mentions: [senderContact] });
  }

  try {
    await randomDelay();
    const downloadUrl = await getUrl(link);
    if (downloadUrl) {
      await createRequest(sub.userId);
      await client.sendMessage(
        msg.from,
        `✅ Hey @${senderContact.number}, here’s your link:\n${downloadUrl}\n\n📊 Usage: ${
          sub.requestsToday + 1
        }/${sub.limit || "∞"} today`,
        { mentions: [senderContact] }
      );
    } else {
      await msg.reply(
        `⚠️ @${senderContact.number}, couldn't fetch the download link. Please try again.`,
        msg.from,
        { mentions: [senderContact] }
      );
    }
  } catch (err) {
    console.error("❌ Error processing request:", err);
    await createRequest(sub.userId);
    await msg.reply(
      `❌ Sorry @${senderContact.number}, I couldn't process your link.`,
      msg.from,
      { mentions: [senderContact] }
    );
  }
});

// ==========================
// GRACEFUL SHUTDOWN
// ==========================
process.on("SIGINT", async () => {
  console.log("🔄 Shutting down gracefully...");
  if (globalBrowser) await globalBrowser.close();
  if (client) await client.destroy();
  process.exit(0);
});

// ==========================
// EXPRESS ROUTES
// ==========================
app.get("/home", (req, res) => res.send("Hello! Express server is working 🚀"));
app.get("/api/browser-status", async (req, res) => {
  try {
    await ensureBrowserHealth();
    res.json({
      status: "healthy",
      browserConnected: !!globalBrowser?.isConnected(),
      pageReady: !!globalPage,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/api/login", (req, res) => {
  const { password } = req.body;
  res.sendStatus(password === ADMIN_PASS ? 200 : 401);
});

app.use("/users", userRoutes);

// ==========================
// START SERVER
// ==========================
app.listen(PORT, () => console.log(`🚀 Express server running at http://localhost:${PORT}`));
client.initialize();
