// utils/erplyClient.js
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

// 4–14 цифр
const DIGIT_BARCODE_RE = /^\d{4,14}$/;

/**
 * Достаём штрих-код из записи Erply.
 * Берём ean / code2 / code и т.п., оставляем только цифры.
 */
function extractBarcodeFromErplyRecord(rec) {
  if (!rec) return undefined;

  const candidatesRaw = [
    rec.ean,
    rec.EAN,
    rec.eanCode,
    rec.ean_code,
    rec.EANCode,
    rec.eanCode2,
    rec.EANCode2,
    rec.upc,
    rec.UPC,
    rec.gtin,
    rec.GTIN,
    rec.barcode,
    rec.Barcode,
    rec.code2,
    rec.CODE2,
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
    ...Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    ),
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

/**
 * Поиск по productID / code (старое поведение) – тут всё как раньше.
 */
async function fetchProductById(erplyId) {
  const id = String(erplyId || "").trim();
  if (!id) return null;

  let recs = await call("getProducts", { productID: id, active: 1 });

  if (!recs || !recs.length) {
    recs = await call("getProducts", { code: id, active: 1 });
  }

  const rec = recs && recs[0] ? recs[0] : null;
  if (!rec) return null;

  rec.__extractedBarcode = extractBarcodeFromErplyRecord(rec);
  return rec;
}

/**
 * Поиск товара по EAN / штрих-коду (как в Postman):
 *
 * 1) Нормализуем: оставляем только цифры.
 * 2) Делаем getProducts({ code2: bc, active: 1 }).
 * 3) Если пусто – пробуем getProducts({ code: bc, active: 1 }).
 * 4) Берём первую запись и дописываем __extractedBarcode.
 */
async function fetchProductByBarcode(barcode) {
  const bc = String(barcode || "").replace(/\D+/g, "");
  if (!DIGIT_BARCODE_RE.test(bc)) return null;

  let recs = [];

  // ТОЧНО ТАК ЖЕ, как у тебя сработало в Postman:
  // request: getProducts, code2: 8711000571958, active: 1
  try {
    recs = await call("getProducts", { code2: bc, active: 1 });
  } catch {
    recs = [];
  }

  // fallback: иногда штрих-код лежит в code
  if (!recs.length) {
    try {
      recs = await call("getProducts", { code: bc, active: 1 });
    } catch {
      recs = [];
    }
  }

  if (!recs.length) return null;

  const rec = recs[0];
  rec.__extractedBarcode = extractBarcodeFromErplyRecord(rec);

  return rec;
}

module.exports = {
  fetchProductById,
  fetchProductByBarcode,
  extractBarcodeFromErplyRecord,
};
