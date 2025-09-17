const cloudinary = require("cloudinary").v2;
const AboutContent = require("../models/aboutContent");

/** ===== Upload helpers ===== */
const uploadFromBuffer = (buffer, folder = "about") =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });

const tryUpload = async (file, folder) => {
  try {
    if (!file?.buffer) return null;
    const up = await uploadFromBuffer(file.buffer, folder);
    return up.secure_url;
  } catch (e) {
    console.error("Cloudinary upload failed:", e?.message || e);
    return null;
  }
};

/** ===== Body coercion (multipart/JSON) ===== */
const parseMaybeJSON = (v) => {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return v; }
};

const coerceAboutBody = (raw) => {
  const b = { ...raw };

  for (const k of [
    "title","subtitle","descriptionIntro","descriptionMore",
    "address","hours","socialsHandle","reasonsTitle","requisitesTitle"
  ]) {
    if (typeof b[k] === "string") b[k] = parseMaybeJSON(b[k]);
  }

  if (typeof b.reasons === "string") {
    const parsed = parseMaybeJSON(b.reasons);
    if (Array.isArray(parsed)) b.reasons = parsed;
    else if (b.reasons.trim()) b.reasons = [b.reasons.trim()];
    else b.reasons = [];
  }

  if (!Array.isArray(b.reasons) && b.reasons && typeof b.reasons === "object") {
    b.reasons = Object.keys(b.reasons)
      .sort((a, z) => Number(a) - Number(z))
      .map((k) => b.reasons[k]);
  }

  return b;
};

/** ===== Локализация: ЗЕРКАЛО ИЗ ТЕКУЩЕГО ЯЗЫКА ВО ВСЕ ===== */
/* Если прилетает объект {en|ru|fi}, берём:
   incoming[lang] || incoming.en || incoming.ru || incoming.fi || prev[lang] || prev.en || prev.ru || prev.fi
   → и зеркалим этот текст во все языки.
*/
function pickText(obj, lang, prev = {}) {
  const candidates = [
    obj?.[lang], obj?.en, obj?.ru, obj?.fi,
    prev?.[lang], prev?.en, prev?.ru, prev?.fi,
  ];
  for (const v of candidates) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function setLocalizedMirror(doc, key, incoming, lang) {
  const prev = doc[key] || {};

  if (incoming && typeof incoming === "object") {
    const srcVal = pickText(incoming, lang, prev);
    if (!srcVal) return;
    doc[key] = { en: srcVal, ru: srcVal, fi: srcVal, _source: lang };
    return;
  }

  const value = String(incoming ?? "").trim();
  if (!value) return;
  doc[key] = { en: value, ru: value, fi: value, _source: lang };
}

/** ===== GET /about =====
 * Больше НЕ создаём документ и НЕ подставляем дефолты.
 * Если в базе ничего нет — отдаём пустой объект {}
 */
exports.getAbout = async (_req, res) => {
  try {
    const doc = await AboutContent.findOne();
    if (!doc) {
      return res.status(200).json({ message: "About empty", data: {} });
    }
    res.status(200).json({ message: "About loaded", data: doc });
  } catch (err) {
    console.error("getAbout error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/** ===== PUT /about ===== */
exports.updateAbout = async (req, res) => {
  try {
    const lang = String(req.headers["accept-language"] || "en").slice(0, 2);

    let body = {};
    if (req.is("application/json"))      body = req.body || {};
    else if (req.body?.payload)          body = JSON.parse(req.body.payload);
    else                                 body = coerceAboutBody(req.body || {});

    let doc = await AboutContent.findOne();
    if (!doc) doc = new AboutContent({});

    // загрузки файлов (если есть)
    const heroUrl  = await tryUpload(req.files?.heroImage?.[0], "about/hero");
    const storeUrl = await tryUpload(req.files?.storeImage?.[0], "about/store");
    const reqsUrl  = await tryUpload(req.files?.requisitesImage?.[0], "about/requisites");

    if (heroUrl)  body.heroImageUrl = heroUrl;
    if (storeUrl) body.storeImageUrl = storeUrl;
    if (reqsUrl)  body.requisitesImageUrl = reqsUrl;

    if (typeof body.heroImageUrl !== "undefined")       doc.heroImageUrl = body.heroImageUrl;
    if (typeof body.storeImageUrl !== "undefined")      doc.storeImageUrl = body.storeImageUrl;
    if (typeof body.requisitesImageUrl !== "undefined") doc.requisitesImageUrl = body.requisitesImageUrl;
    if (typeof body.gmapsUrl !== "undefined")           doc.gmapsUrl = body.gmapsUrl;

    // локализованные поля — ЗЕРКАЛИМ
    if (typeof body.title !== "undefined")            setLocalizedMirror(doc, "title", body.title, lang);
    if (typeof body.subtitle !== "undefined")         setLocalizedMirror(doc, "subtitle", body.subtitle, lang);
    if (typeof body.descriptionIntro !== "undefined") setLocalizedMirror(doc, "descriptionIntro", body.descriptionIntro, lang);
    if (typeof body.descriptionMore !== "undefined")  setLocalizedMirror(doc, "descriptionMore", body.descriptionMore, lang);
    if (typeof body.address !== "undefined")          setLocalizedMirror(doc, "address", body.address, lang);
    if (typeof body.hours !== "undefined")            setLocalizedMirror(doc, "hours", body.hours, lang);
    if (typeof body.socialsHandle !== "undefined")    setLocalizedMirror(doc, "socialsHandle", body.socialsHandle, lang);
    if (typeof body.reasonsTitle !== "undefined")     setLocalizedMirror(doc, "reasonsTitle", body.reasonsTitle, lang);
    if (typeof body.requisitesTitle !== "undefined")  setLocalizedMirror(doc, "requisitesTitle", body.requisitesTitle, lang);

    // reasons — берём текст активного языка (или любой имеющийся) и зеркалим
    if (Array.isArray(body.reasons)) {
      const prev = Array.isArray(doc.reasons) ? doc.reasons : [];
      const out = body.reasons.map((val, i) => {
        let text = "";
        if (val && typeof val === "object") {
          text = pickText(val, lang, prev[i]);
        } else {
          text = String(val ?? "").trim();
        }
        if (!text) return prev[i] || {};
        return { en: text, ru: text, fi: text, _source: lang };
      });
      doc.reasons = out;
    }

    if (req.user?._id) doc.updatedBy = req.user._id;

    await doc.save();
    res.status(200).json({ message: "About updated", data: doc });
  } catch (err) {
    console.error("updateAbout error:", {
      name: err.name,
      message: err.message,
      errors: err.errors,
      stack: err.stack,
    });
    res.status(500).json({ message: err.message || "Server error" });
  }
};
