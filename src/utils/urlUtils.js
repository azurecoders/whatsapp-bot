import { URL_CONFIG } from "../config/index.js";

// ==========================
// TRANSFORM FREEPIK URL TO PROXY
// ==========================
export function transformFreepikUrl(url) {
  if (!url) return null;

  // Check if it's a freepik.com URL
  const freepikPattern = /https?:\/\/(www\.)?freepik\.com/i;

  if (freepikPattern.test(url)) {
    // Replace the domain with pakseotools proxy
    const transformedUrl = url.replace(freepikPattern, URL_CONFIG.proxyBaseUrl);
    console.log(`🔄 URL Transformed:`);
    console.log(`   Original: ${url}`);
    console.log(`   Proxy:    ${transformedUrl}`);
    return transformedUrl;
  }

  // If already a pakseotools URL, return as-is
  if (url.includes(URL_CONFIG.proxyDomain)) {
    console.log(`✅ URL already using proxy: ${url}`);
    return url;
  }

  console.log(`⚠️ URL not recognized as Freepik: ${url}`);
  return url;
}

// ==========================
// VALIDATE FREEPIK URL
// ==========================
export function isValidFreepikUrl(url) {
  if (!url) return false;

  const validPatterns = [
    /https?:\/\/(www\.)?freepik\.com\/.+/i,
    /https?:\/\/freepik\.pakseotools\.com\/.+/i,
  ];

  return validPatterns.some((pattern) => pattern.test(url));
}

// ==========================
// EXTRACT URL FROM MESSAGE
// ==========================
export function extractUrlFromMessage(message) {
  const urlMatch = message.match(/https?:\/\/[^\s]+/);
  return urlMatch ? urlMatch[0] : null;
}
