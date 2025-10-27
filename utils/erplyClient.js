const axios = require("axios");

const ERPLY_BASE = process.env.ERPLY_BASE; // https://YOURACCOUNT.erply.com/api/
const ERPLY_CLIENT_CODE = process.env.ERPLY_CLIENT_CODE;
const ERPLY_USERNAME = process.env.ERPLY_USERNAME;
const ERPLY_PASSWORD = process.env.ERPLY_PASSWORD;

let cachedKey = null;
let cachedAt = 0;

async function getSessionKey() {
  const now = Date.now();
  if (cachedKey && now - cachedAt < 15 * 60 * 1000) return cachedKey; // кэш на 15 мин

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
    throw new Error(`Erply request failed: ${request}`);
  }
  return data.records || [];
}

async function fetchProductById(erplyId) {
  const recs = await call("getProducts", { productID: erplyId, active: 1 });
  return recs[0] || null;
}

async function fetchProductByBarcode(barcode) {
  const recs = await call("getProducts", { code: barcode, active: 1 });
  return recs[0] || null;
}

module.exports = { fetchProductById, fetchProductByBarcode };
