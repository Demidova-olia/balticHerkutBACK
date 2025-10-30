const axios = require("axios");

const ERPLY_BASE = process.env.ERPLY_BASE;     
const ERPLY_CLIENT_CODE = process.env.ERPLY_CLIENT_CODE;
const ERPLY_USERNAME = process.env.ERPLY_USERNAME;
const ERPLY_PASSWORD = process.env.ERPLY_PASSWORD;

if (!ERPLY_BASE || !ERPLY_CLIENT_CODE || !ERPLY_USERNAME || !ERPLY_PASSWORD) {
  throw new Error(
    "[erplyClient] Missing ERPLY env vars: ERPLY_BASE, ERPLY_CLIENT_CODE, ERPLY_USERNAME, ERPLY_PASSWORD"
  );
}

let cachedKey = null;
let cachedAt = 0;

const DIGIT_BARCODE_RE = /^\d{4,14}$/; 
function extractBarcodeFromErplyRecord(rec) {
  if (!rec) return undefined;
  const candidatesRaw = [
    rec.ean, rec.EAN, rec.eanCode, rec.ean_code, rec.EANCode,
    rec.upc, rec.UPC,
    rec.gtin, rec.GTIN,
    rec.barcode, rec.Barcode,
    rec.code2, rec.CODE2,
  ].filter(Boolean);

  for (const v of candidatesRaw) {
    const digits = String(v).replace(/\D+/g, "");
    if (DIGIT_BARCODE_RE.test(digits)) return digits;
  }

  if (rec.code != null) {
    const digits = String(rec.code).replace(/\D+/g, "");
    if (DIGIT_BARCODE_RE.test(digits)) return digits;
  }
  return undefined;
}

async function getSessionKey() {
  const now = Date.now();
  if (cachedKey && now - cachedAt < 15 * 60 * 1000) return cachedKey; 

  const { data } = await axios.post(
    ERPLY_BASE,
    new URLSearchParams({
      clientCode: ERPLY_CLIENT_CODE,
      username: ERPLY_USERNAME,
      password: ERPLY_PASSWORD,
      request: "verifyUser",
    })
  );

  if (!data || data.status?.responseStatus !== "ok") {
    throw new Error("Erply auth failed");
  }
  cachedKey = data.records?.[0]?.sessionKey;
  cachedAt = now;
  return cachedKey;
}

async function call(request, params = {}) {
  const sessionKey = await getSessionKey();
  const payload = new URLSearchParams({
    clientCode: ERPLY_CLIENT_CODE,
    request,
    sessionKey,
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  const { data } = await axios.post(ERPLY_BASE, payload);
  if (!data || data.status?.responseStatus !== "ok") {
    const msg = data?.status?.errorCode
      ? `Erply ${request} error ${data.status.errorCode}`
      : `Erply request failed: ${request}`;
    throw new Error(msg);
  }
  return data.records || [];
}

async function fetchProductById(erplyId) {
  const recs = await call("getProducts", { productID: erplyId, active: 1 });
  const rec = recs[0] || null;
  if (!rec) return null;
  rec.__extractedBarcode = extractBarcodeFromErplyRecord(rec);
  return rec;
}

async function fetchProductByBarcode(barcode) {

  let recs = await call("getProducts", { ean: barcode, active: 1 }).catch(() => []);
  if (!recs?.length) {

    recs = await call("getProducts", { code2: barcode, active: 1 }).catch(() => []);
  }
  if (!recs?.length) {

    recs = await call("getProducts", { code: barcode, active: 1 }).catch(() => []);
  }
  const rec = recs?.[0] || null;
  if (!rec) return null;
  rec.__extractedBarcode = extractBarcodeFromErplyRecord(rec);
  return rec;
}

module.exports = {
  fetchProductById,
  fetchProductByBarcode,
  extractBarcodeFromErplyRecord,
};
