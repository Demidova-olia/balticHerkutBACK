

const crypto = require("crypto");

const cache = new Map();
const key = (txt, from, to) =>
  crypto.createHash("sha1").update(`${from}:${to}:${txt}`).digest("hex");

const hasFetch = typeof fetch === "function";
async function requestJSON(url, options) {
  if (!hasFetch) {

    throw new Error("fetch is not available in this Node runtime");
  }
  const res = await fetch(url, options);

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function detectLang(text = "") {
  const s = String(text);
  if (/[а-яё]/i.test(s)) return "ru";
  if (/[äöå]/i.test(s)) return "fi";
  return "en";
}

async function translateText(text, from, to) {
  const t = String(text || "");
  if (!t || from === to) return t;

  const ck = key(t, from, to);
  const hit = cache.get(ck);
  if (hit) return hit;

  const deeplKey = process.env.DEEPL_KEY;

  // --- DeepL ---
  if (deeplKey) {
    try {
      const body = new URLSearchParams({
        text: t,
        source_lang: from.toUpperCase(),
        target_lang: to.toUpperCase(),
      });
      const data = await requestJSON("https://api-free.deepl.com/v2/translate", {
        method: "POST",
        headers: {
          Authorization: `DeepL-Auth-Key ${deeplKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
      const out = data?.translations?.[0]?.text || t;
      cache.set(ck, out);
      return out;
    } catch (e) {
      console.warn("[translateText] DeepL failed:", e?.message || e);
    }
  }

  try {
    const url =
      "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t" +
      `&sl=${from}&tl=${to}&q=${encodeURIComponent(t)}`;
    const data = await requestJSON(url);
    const out = Array.isArray(data)
      ? (data[0] || []).map((x) => (Array.isArray(x) ? x[0] : "")).join("")
      : "";
    const finalTxt = out || t;
    cache.set(ck, finalTxt);
    return finalTxt;
  } catch (e) {
    console.warn("[translateText] Google failed:", e?.message || e);
  }

  return t;
}

function splitSegments(text) {
  return String(text).split(/(\. |\? |\! |\n)/g).filter(Boolean);
}

async function translateMixedText(input, target) {
  const parts = splitSegments(input);
  const out = [];
  for (const p of parts) {
    const from = detectLang(p);
    if (from === "en" || from === "ru" || from === "fi") {
      out.push(await translateText(p, from, target));
    } else {
      out.push(p);
    }
  }
  return out.join("");
}

async function buildLocalizedField(latestText) {
  const src = detectLang(latestText);
  const langs = ["ru", "en", "fi"];
  const obj = { ru: "", en: "", fi: "", _source: src, _mt: {} };
  for (const to of langs) {
    if (to === src) {
      obj[to] = String(latestText);
      obj._mt[to] = false;
    } else {
      try {
        obj[to] = await translateMixedText(latestText, to);
        obj._mt[to] = true;
      } catch {
        obj[to] = String(latestText); // graceful fallback
        obj._mt[to] = true;
      }
    }
  }
  return obj;
}

async function updateLocalizedField(existing, latestText) {
  const src = detectLang(latestText);
  const base = existing || { ru: "", en: "", fi: "", _source: src, _mt: {} };
  base[src] = String(latestText);
  base._source = src;
  base._mt = base._mt || {};
  base._mt[src] = false;

  for (const to of ["ru", "en", "fi"]) {
    if (to === src) continue;
    if (!base[to] || base._mt?.[to]) {
      try {
        base[to] = await translateMixedText(latestText, to);
        base._mt[to] = true;
      } catch {
        base[to] = String(latestText);
        base._mt[to] = true;
      }
    }
  }
  return base;
}

function pickLangFromReq(req) {
  const client = (req.headers["x-client-lang"] || "").toString().toLowerCase();
  const accept = (req.headers["accept-language"] || "en").toString().toLowerCase();

  const candidates = []
    .concat(client.split(","))
    .concat(accept.split(","))
    .map((s) => s.trim().split(";")[0]) 
    .map((s) => s.split("-")[0])
    .filter(Boolean);

  const supported = ["ru", "en", "fi"];
  const found = candidates.find((c) => supported.includes(c));
  return found || "en";
}

function pickLocalized(ls, want) {
  if (!ls) return "";
  const order = [want, ls._source || "en", "ru", "en", "fi"];
  for (const k of order) {
    const v = ls[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

module.exports = {
  detectLang,
  translateText,
  translateMixedText,
  buildLocalizedField,
  updateLocalizedField,
  pickLangFromReq,
  pickLocalized,
};
