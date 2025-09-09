const crypto = require("crypto");
const fetch = require("node-fetch");

// В проде лучше Redis/БД. Пока — в памяти.
const cache = new Map();
const key = (txt, from, to) =>
  crypto.createHash("sha1").update(`${from}:${to}:${txt}`).digest("hex");

// Очень простое определение языка (ру/фи/ен)
function detectLang(text = "") {
  const s = String(text);
  if (/[а-яё]/i.test(s)) return "ru";
  if (/[äöå]/i.test(s)) return "fi";
  return "en";
}

/**
 * Универсальный переводчик.
 * 1) Если есть DEEPL_KEY — используем DeepL (рекомендую).
 * 2) Иначе пробуем публичный endpoint Google (без ключа; не для прод-нагрузки).
 * 3) Если ничего не доступно — возвращаем исходный текст.
 */
async function translateText(text, from, to) {
  const t = String(text || "");
  if (!t || from === to) return t;

  const ck = key(t, from, to);
  const hit = cache.get(ck);
  if (hit) return hit;

  const deeplKey = process.env.DEEPL_KEY;
  try {
    if (deeplKey) {
      const res = await fetch("https://api-free.deepl.com/v2/translate", {
        method: "POST",
        headers: {
          "Authorization": `DeepL-Auth-Key ${deeplKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          text: t,
          source_lang: from.toUpperCase(),
          target_lang: to.toUpperCase(),
        }),
      });
      const data = await res.json();
      const out = data?.translations?.[0]?.text || t;
      cache.set(ck, out);
      return out;
    }
  } catch (e) {
    console.warn("[translateText] DeepL failed:", e?.message || e);
  }

  // Google gtx (без ключа). Работает, но не гарантируется поставщиком.
  try {
    const url =
      "https://translate.googleapis.com/translate_a/single?client=gtx&dt=t" +
      `&sl=${from}&tl=${to}&q=${encodeURIComponent(t)}`;
    const res = await fetch(url);
    const data = await res.json();
    const out = (data?.[0] || [])
      .map((x) => (Array.isArray(x) ? x[0] : ""))
      .join("");
    const finalTxt = out || t;
    cache.set(ck, finalTxt);
    return finalTxt;
  } catch (e) {
    console.warn("[translateText] Google failed:", e?.message || e);
  }

  return t;
}

// Простой сплит по предложениям/переносам
function splitSegments(text) {
  return String(text).split(/(\. |\? |\! |\n)/g).filter(Boolean);
}

// Перевод "смешанного" текста: переводим только сегменты не целевого языка
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

// Собираем локализованное поле из одного ввода (любой язык)
async function buildLocalizedField(latestText) {
  const src = detectLang(latestText);
  const langs = ["ru", "en", "fi"];
  const obj = { ru: "", en: "", fi: "", _source: src, _mt: {} };
  for (const to of langs) {
    if (to === src) {
      obj[to] = String(latestText);
      obj._mt[to] = false;
    } else {
      obj[to] = await translateMixedText(latestText, to);
      obj._mt[to] = true;
    }
  }
  return obj;
}

// Обновление уже существующего локализованного поля новым вводом
async function updateLocalizedField(existing, latestText) {
  const src = detectLang(latestText);
  const base = existing || { ru: "", en: "", fi: "", _source: src, _mt: {} };
  base[src] = String(latestText);
  base._source = src;
  base._mt = base._mt || {};
  base._mt[src] = false;

  for (const to of ["ru", "en", "fi"]) {
    if (to === src) continue;
    // Перезаписываем только если пусто или было машинным
    if (!base[to] || base._mt?.[to]) {
      base[to] = await translateMixedText(latestText, to);
      base._mt[to] = true;
    }
  }
  return base;
}

// Выбор лучшего варианта под язык
function pickLangFromReq(req) {
  const hdr = (req.headers["accept-language"] || "en").toString().toLowerCase();
  const short = hdr.split(",")[0].slice(0, 2);
  return ["ru", "en", "fi"].includes(short) ? short : "en";
}
function pickLocalized(ls, want) {
  if (!ls) return "";
  return ls[want] || ls[ls._source || "en"] || ls.ru || ls.en || ls.fi || "";
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
