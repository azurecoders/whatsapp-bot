import puppeteer from "puppeteer";
import {
  DOWNLOADS_DIR,
  TIMEOUTS,
  URL_CONFIG,
  PAKSEOTOOLS_CREDENTIALS,
} from "../config/index.js";

// ==========================
// GLOBAL BROWSER STATE
// ==========================
let globalBrowser = null;
let globalPage = null;
let isBrowserInitializing = false;
let cdpSession = null;
let isProcessingRequest = false;
let isLoggedIn = false; // ✅ Track login state

// ==========================
// GETTERS
// ==========================
export function getBrowser() {
  return globalBrowser;
}

export function getPage() {
  return globalPage;
}

export function getCdpSession() {
  return cdpSession;
}

export function isProcessing() {
  return isProcessingRequest;
}

export function setProcessing(value) {
  isProcessingRequest = value;
}

export function getLoginStatus() {
  return isLoggedIn;
}

// ==========================
// ✅ CHECK IF ON LOGIN PAGE
// ==========================
async function isOnLoginPage() {
  try {
    const currentUrl = await globalPage.url();
    return (
      currentUrl.includes("/login") ||
      currentUrl.includes("app.pakseotools.com/login")
    );
  } catch (e) {
    return false;
  }
}

// ==========================
// ✅ PERFORM LOGIN
// ==========================
async function performLogin() {
  console.log("🔐 Login required, performing login...");

  try {
    const currentUrl = await globalPage.url();
    console.log(`📍 Current URL: ${currentUrl}`);

    // Wait for login form to be ready
    await globalPage.waitForSelector(
      'input[name="amember_login"], input#amember-login',
      {
        visible: true,
        timeout: 10000,
      }
    );

    console.log("📝 Filling login form...");

    // Clear and fill email/username field
    const usernameSelector = 'input[name="amember_login"], input#amember-login';
    await globalPage.click(usernameSelector, { clickCount: 3 }); // Select all
    await globalPage.type(usernameSelector, PAKSEOTOOLS_CREDENTIALS.email, {
      delay: 50,
    });

    // Clear and fill password field
    const passwordSelector = 'input[name="amember_pass"], input#amember-pass';
    await globalPage.click(passwordSelector, { clickCount: 3 }); // Select all
    await globalPage.type(passwordSelector, PAKSEOTOOLS_CREDENTIALS.password, {
      delay: 50,
    });

    console.log("🔄 Submitting login form...");

    // Click login button and wait for navigation
    await Promise.all([
      globalPage.waitForNavigation({
        waitUntil: "networkidle2",
        timeout: TIMEOUTS.navigation,
      }),
      globalPage.click(
        'input[type="submit"][value="Login"], button[type="submit"]'
      ),
    ]);

    // Wait a bit for any redirects
    await new Promise((r) => setTimeout(r, 3000));

    // Check if login was successful
    const afterLoginUrl = await globalPage.url();
    console.log(`📍 After login URL: ${afterLoginUrl}`);

    // Check for login errors
    const hasError = await globalPage.evaluate(() => {
      const errorElement = document.querySelector(
        ".am-error, .error, .alert-danger"
      );
      return errorElement ? errorElement.textContent : null;
    });

    if (hasError) {
      console.error(`❌ Login error: ${hasError}`);
      throw new Error(`Login failed: ${hasError}`);
    }

    // If still on login page, login failed
    if (afterLoginUrl.includes("/login")) {
      throw new Error("Login failed - still on login page");
    }

    isLoggedIn = true;
    console.log("✅ Login successful!");

    return true;
  } catch (error) {
    console.error("❌ Login failed:", error.message);
    isLoggedIn = false;
    throw error;
  }
}

// ==========================
// ✅ ENSURE LOGGED IN
// ==========================
async function ensureLoggedIn() {
  if (await isOnLoginPage()) {
    await performLogin();
  }
}

// ==========================
// BROWSER INITIALIZATION
// ==========================
export async function initGlobalBrowser() {
  if (isBrowserInitializing) {
    console.log("⏳ Browser already initializing, waiting...");
    while (isBrowserInitializing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return;
  }

  // Check if browser already exists and is connected
  if (globalBrowser && globalPage) {
    try {
      if (globalBrowser.isConnected()) {
        console.log("✅ Browser already initialized and connected");
        return;
      }
    } catch (e) {
      console.log("⚠️ Browser check failed:", e.message);
    }
  }

  try {
    isBrowserInitializing = true;
    isLoggedIn = false;
    console.log("🔄 Initializing global browser...");

    // Close existing browser if any
    if (globalBrowser) {
      try {
        console.log("🔄 Closing existing browser...");
        await globalBrowser.close();
      } catch (e) {
        console.log("⚠️ Error closing existing browser:", e.message);
      }
      globalBrowser = null;
      globalPage = null;
      cdpSession = null;
    }

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

    // Handle browser disconnect event
    globalBrowser.on("disconnected", () => {
      console.log("⚠️ Browser disconnected!");
      globalBrowser = null;
      globalPage = null;
      cdpSession = null;
      isLoggedIn = false;
    });

    globalPage = await globalBrowser.newPage();

    // Configure download behavior using CDP
    cdpSession = await globalPage.target().createCDPSession();
    await cdpSession.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: DOWNLOADS_DIR,
    });

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

    // ✅ Open PakSeoTools proxy and handle login
    const url = URL_CONFIG.proxyBaseUrl;
    console.log(`🌐 Opening PakSeoTools proxy: ${url}`);

    await globalPage.goto(url, {
      waitUntil: "networkidle2",
      timeout: TIMEOUTS.navigation,
    });

    // ✅ Check if redirected to login and handle it
    await ensureLoggedIn();

    // ✅ After login, navigate to the proxy homepage
    const currentUrl = await globalPage.url();
    if (!currentUrl.includes(URL_CONFIG.proxyDomain)) {
      console.log(`🔄 Navigating back to proxy: ${url}`);
      await globalPage.goto(url, {
        waitUntil: "networkidle2",
        timeout: TIMEOUTS.navigation,
      });
    }

    console.log("✅ Global browser initialized successfully");
    console.log(`📁 Downloads directory: ${DOWNLOADS_DIR}`);
    console.log(`🔗 Using proxy: ${URL_CONFIG.proxyDomain}`);
    console.log(
      `🔐 Login status: ${isLoggedIn ? "Logged in" : "Not logged in"}`
    );
  } catch (error) {
    console.error("❌ Error initializing global browser:", error);

    // Cleanup on error
    if (globalBrowser) {
      try {
        await globalBrowser.close();
      } catch (e) {}
    }
    globalBrowser = null;
    globalPage = null;
    cdpSession = null;
    isLoggedIn = false;
  } finally {
    isBrowserInitializing = false;
  }
}

// ==========================
// BROWSER HEALTH CHECK
// ==========================
export async function ensureBrowserHealth() {
  console.log("🔍 Checking browser health...");

  try {
    // Check if browser exists
    if (!globalBrowser || !globalPage) {
      console.log("⚠️ Browser or page is null, initializing...");
      await initGlobalBrowser();
      return;
    }

    // Check if browser is connected
    if (!globalBrowser.isConnected()) {
      console.log("⚠️ Browser disconnected, reinitializing...");
      globalBrowser = null;
      globalPage = null;
      cdpSession = null;
      isLoggedIn = false;
      await initGlobalBrowser();
      return;
    }

    // Simple check - verify pages exist
    const pages = await globalBrowser.pages();
    if (pages.length === 0) {
      console.log("⚠️ No pages in browser, creating new page...");
      globalPage = await globalBrowser.newPage();
      isLoggedIn = false;

      // Reconfigure CDP session
      cdpSession = await globalPage.target().createCDPSession();
      await cdpSession.send("Page.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: DOWNLOADS_DIR,
      });
    } else if (!pages.includes(globalPage)) {
      console.log("⚠️ Global page not in browser pages, using first page...");
      globalPage = pages[0];

      // Reconfigure CDP session
      cdpSession = await globalPage.target().createCDPSession();
      await cdpSession.send("Page.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: DOWNLOADS_DIR,
      });
    }

    console.log(`✅ Browser is healthy (Logged in: ${isLoggedIn})`);
  } catch (error) {
    console.log("⚠️ Browser health check failed:", error.message);
    console.log("🔄 Reinitializing browser...");

    // Properly close old browser before creating new one
    if (globalBrowser) {
      try {
        await globalBrowser.close();
      } catch (e) {
        console.log("⚠️ Error closing browser:", e.message);
      }
    }

    globalBrowser = null;
    globalPage = null;
    cdpSession = null;
    isLoggedIn = false;
    await initGlobalBrowser();
  }
}

// ==========================
// ✅ NAVIGATE TO URL (WITH LOGIN CHECK)
// ==========================
export async function navigateToUrl(url) {
  console.log(`🔄 Navigating to: ${url}`);
  console.log(`⏱️ Using timeout: ${TIMEOUTS.navigation / 1000} seconds`);

  try {
    // Reconfigure download path before navigation
    if (cdpSession) {
      try {
        await cdpSession.send("Page.setDownloadBehavior", {
          behavior: "allow",
          downloadPath: DOWNLOADS_DIR,
        });
      } catch (e) {
        console.log("⚠️ CDP session error, recreating...");
        cdpSession = await globalPage.target().createCDPSession();
        await cdpSession.send("Page.setDownloadBehavior", {
          behavior: "allow",
          downloadPath: DOWNLOADS_DIR,
        });
      }
    }

    await globalPage.goto(url, {
      waitUntil: "networkidle2",
      timeout: TIMEOUTS.navigation,
    });

    // ✅ Check if redirected to login page
    if (await isOnLoginPage()) {
      console.log("🔐 Redirected to login, logging in...");
      await performLogin();

      // Navigate back to original URL after login
      console.log(`🔄 Navigating back to: ${url}`);
      await globalPage.goto(url, {
        waitUntil: "networkidle2",
        timeout: TIMEOUTS.navigation,
      });
    }

    await globalPage.setViewport({ width: 1280, height: 800 });

    // Wait for page to stabilize
    console.log(
      `⏳ Waiting ${TIMEOUTS.initialWait / 1000}s for page to stabilize...`
    );
    await new Promise((r) => setTimeout(r, TIMEOUTS.initialWait));

    console.log(`✅ Navigation successful`);
    return true;
  } catch (error) {
    console.error("❌ Navigation error:", error.message);
    return false;
  }
}

// ==========================
// CLOSE BROWSER
// ==========================
export async function closeBrowser() {
  if (globalBrowser) {
    console.log("🌐 Closing browser...");
    try {
      await globalBrowser.close();
    } catch (e) {
      console.log("⚠️ Error closing browser:", e.message);
    }
    globalBrowser = null;
    globalPage = null;
    cdpSession = null;
    isLoggedIn = false;
  }
}

// ==========================
// ✅ FORCE RE-LOGIN
// ==========================
export async function forceReLogin() {
  console.log("🔄 Forcing re-login...");
  isLoggedIn = false;

  try {
    // Navigate to login page
    await globalPage.goto(PAKSEOTOOLS_CREDENTIALS.loginUrl, {
      waitUntil: "networkidle2",
      timeout: TIMEOUTS.navigation,
    });

    // Perform login
    await performLogin();

    return true;
  } catch (error) {
    console.error("❌ Force re-login failed:", error.message);
    return false;
  }
}

// ==========================
// GET BROWSER STATUS
// ==========================
export async function getBrowserStatus() {
  try {
    const isConnected = globalBrowser?.isConnected() || false;
    const pageCount = globalBrowser ? (await globalBrowser.pages()).length : 0;

    return {
      status: isConnected ? "healthy" : "disconnected",
      browserConnected: isConnected,
      pageReady: !!globalPage,
      pageCount: pageCount,
      isProcessingRequest: isProcessingRequest,
      isLoggedIn: isLoggedIn, // ✅ Include login status
    };
  } catch (err) {
    return { status: "error", message: err.message };
  }
}
