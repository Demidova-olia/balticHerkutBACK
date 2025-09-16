const cloudinary = require("cloudinary").v2;
const AboutContent = require("../models/aboutContent");

/** -------- helpers (новые) -------- */
const uploadFromBuffer = (buffer, folder = "about") =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });

const parseMaybeJSON = (v) => {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return v; }
};

const coerceAboutBody = (raw) => {
  const b = { ...raw };

  // поля, которые могут приходить JSON-строкой (локализованные объекты)
  for (const k of [
    "title","subtitle","descriptionIntro","descriptionMore",
    "address","hours","socialsHandle","reasonsTitle","requisitesTitle"
  ]) {
    if (typeof b[k] === "string") b[k] = parseMaybeJSON(b[k]);
  }

  // reasons может прийти строкой JSON / одиночной строкой / объектом с индексами
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

const tryUpload = async (file, folder) => {
  try {
    if (!file?.buffer) return null;
    const up = await uploadFromBuffer(file.buffer, folder);
    return up.secure_url;
  } catch (e) {
    console.error("Cloudinary upload failed:", e?.message || e);
    return null; // не блокируем сохранение текста
  }
};

const updateLocalized = (doc, key, value, lang) => {
  if (value == null) return;
  const cur = doc[key] || {};
  if (value && typeof value === "object") {
    doc[key] = { ...cur, ...value };
  } else {
    const v = String(value).trim();
    if (!v) return; // не затираем существующее пустым
    doc[key] = { ...cur, [lang]: v, _source: lang };
  }
};
/** -------- /helpers -------- */

exports.getAbout = async (_req, res) => {
  try {
    let doc = await AboutContent.findOne();
    if (!doc) {
      doc = await AboutContent.create({
        heroImageUrl: "/assets/Logo.jpg",
        storeImageUrl: "/assets/storefront.jpg",
        requisitesImageUrl: "/assets/banner_margins.jpg",

        title: { en: "About Us", _source: "en" },
        subtitle: {
          en: "Baltic Herkut — your favorite Baltic foods in Oulu.",
          _source: "en",
        },

        descriptionIntro: {
          en: "We bring fresh and trusted products from the Baltic region: dairy and meat products, fish, preserves, sweets, beverages and more.",
          _source: "en",
        },
        descriptionMore: {
          en: "We work daily to keep fair prices and friendly service. You're always welcome to discover new flavors!",
          _source: "en",
        },

        address: { en: "Limingantie 9, Oulu", _source: "en" },
        hours: {
          en: "Mon–Fri 12:00–19:00, Sat 12:00–17:00, Sun 12:00–16:00",
          _source: "en",
        },
        gmapsUrl: "https://maps.google.com/?q=Limingantie+9,+Oulu",

        socialsHandle: { en: "@balticherkut", _source: "en" },

        reasonsTitle: { en: "Why Baltic Herkut?", _source: "en" },
        requisitesTitle: { en: "Requisites", _source: "en" },

        reasons: [
          { en: "Reliable suppliers and stable quality", _source: "en" },
          { en: "Regularly updated assortment", _source: "en" },
          { en: "Friendly staff and help with selection", _source: "en" },
        ],
      });
    }
    res.status(200).json({ message: "About loaded", data: doc });
  } catch (err) {
    console.error("getAbout error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateAbout = async (req, res) => {
  try {
    const lang = String(req.headers["accept-language"] || "en").slice(0, 2);

    let body = {};
    if (req.is("application/json")) {
      body = req.body || {};
    } else if (req.body?.payload) {
      body = JSON.parse(req.body.payload);
    } else {
      body = coerceAboutBody(req.body || {}); // ← ВАЖНО: коэрция multipart-тела
    }

    let doc = await AboutContent.findOne();
    if (!doc) doc = new AboutContent({});

    // безопасные загрузки — не валят весь апдейт
    const heroUrl = await tryUpload(req.files?.heroImage?.[0], "about/hero");
    const storeUrl = await tryUpload(req.files?.storeImage?.[0], "about/store");
    const reqsUrl  = await tryUpload(req.files?.requisitesImage?.[0], "about/requisites");

    if (heroUrl) body.heroImageUrl = heroUrl;
    if (storeUrl) body.storeImageUrl = storeUrl;
    if (reqsUrl)  body.requisitesImageUrl = reqsUrl;

    if (typeof body.heroImageUrl !== "undefined") doc.heroImageUrl = body.heroImageUrl;
    if (typeof body.storeImageUrl !== "undefined") doc.storeImageUrl = body.storeImageUrl;
    if (typeof body.requisitesImageUrl !== "undefined") doc.requisitesImageUrl = body.requisitesImageUrl;
    if (typeof body.gmapsUrl !== "undefined") doc.gmapsUrl = body.gmapsUrl;

    for (const k of [
      "title","subtitle","descriptionIntro","descriptionMore",
      "address","hours","socialsHandle","reasonsTitle","requisitesTitle"
    ]) {
      if (typeof body[k] !== "undefined") updateLocalized(doc, k, body[k], lang);
    }

    if (Array.isArray(body.reasons)) {
      doc.reasons = body.reasons.map((r) =>
        r && typeof r === "object"
          ? r
          : { [lang]: String(r || ""), _source: lang }
      );
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
