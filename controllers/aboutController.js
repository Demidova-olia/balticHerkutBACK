// controllers/aboutController.js
const cloudinary = require("cloudinary").v2;
const AboutContent = require("../models/aboutContentModel");

// ====== helpers for uploads ===================================================
const uploadFromBuffer = (buffer, folder = "about") =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });

// ====== helpers for i18n ======================================================
const isLocalizedObject = (v) =>
  v && typeof v === "object" && ("ru" in v || "en" in v || "fi" in v);

/**
 * mergeLocalized:
 * - value строка + lang -> обновляем только этот язык, остальные сохраняем
 * - value i18n-объект -> аккуратно сливаем по ключам ru/en/fi
 * - value пусто -> ничего не меняем
 */
function mergeLocalized(prevValue, value, lang) {
  if (typeof value === "undefined" || value === null) return prevValue;

  // пришла строка
  if (typeof value === "string") {
    if (!lang) return value; // если язык не указан — храним как строку
    const base = isLocalizedObject(prevValue) ? { ...prevValue } : {};
    base[lang] = value;
    return base;
  }

  // пришел объект {ru,en,fi}
  if (isLocalizedObject(value)) {
    const base = isLocalizedObject(prevValue) ? { ...prevValue } : {};
    if ("ru" in value) base.ru = value.ru;
    if ("en" in value) base.en = value.en;
    if ("fi" in value) base.fi = value.fi;
    return base;
  }

  // иначе просто вернуть как есть
  return value;
}

/**
 * mergeLocalizedArray:
 * - массив строк + lang  -> каждый элемент трактуем как перевод для lang
 * - массив i18n-объектов -> заменяем целиком
 */
function mergeLocalizedArray(prevArr, value, lang) {
  if (!Array.isArray(value)) return prevArr;
  const prev = Array.isArray(prevArr) ? prevArr : [];

  // массив строк -> мапим по индексам, мерджим по lang
  if (value.every((v) => typeof v === "string")) {
    if (!lang) return value;
    const merged = value.map((val, idx) => mergeLocalized(prev[idx], val, lang));
    return merged;
  }

  // массив i18n объектов -> заменяем
  if (value.every(isLocalizedObject)) {
    return value;
  }

  return prev;
}

// Список локализованных полей (плоская схема)
const TEXT_FIELDS = [
  "title",
  "subtitle",
  "descriptionIntro",
  "descriptionMore",
  "address",
  "hours",
  "reasonsTitle",
  "requisitesTitle",
  "socialsHandle",
];

// ====== GET /about ============================================================
exports.getAbout = async (req, res) => {
  try {
    let doc = await AboutContent.findOne().lean();
    if (!doc) {
      doc = await (await AboutContent.create({})).toObject();
    }

    // Если нужно вернуть «разрешённые» строки под язык
    const resolve = String(req.query.resolve || "0") === "1";
    if (!resolve) {
      return res.status(200).json({ message: "About loaded", data: doc });
    }

    const lang =
      (req.query.lang ||
        req.headers["accept-language"] ||
        "en").toString().slice(0, 2);

    // функция разрешения одного поля
    const R = (v) => {
      if (v == null) return v;
      if (typeof v === "string") return v;
      if (isLocalizedObject(v)) return v[lang] || v.en || v.ru || v.fi || "";
      return v;
    };

    const resolved = {
      // не локализованные
      heroImageUrl: doc.heroImageUrl || doc.heroImageURL || "",
      storeImageUrl: doc.storeImageUrl || doc.store?.imageUrl || "",
      requisitesImageUrl: doc.requisitesImageUrl || "",
      gmapsUrl: doc.gmapsUrl || doc.store?.mapUrl || "",

      // локализованные
      title: R(doc.title || doc.heading),
      subtitle: R(doc.subtitle || doc.subheading),
      descriptionIntro: R(doc.descriptionIntro || doc.store?.description),
      descriptionMore: R(doc.descriptionMore),
      address: R(doc.address || doc.store?.address),
      hours: R(doc.hours || doc.store?.hours),
      reasonsTitle: R(doc.reasonsTitle),
      requisitesTitle: R(doc.requisitesTitle || "Requisites"),
      socialsHandle: R(doc.socialsHandle),

      reasons: Array.isArray(doc.reasons) ? doc.reasons.map(R) : [],
      updatedAt: doc.updatedAt,
    };

    return res.status(200).json({ message: "About loaded", data: resolved });
  } catch (err) {
    console.error("getAbout error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ====== PUT /about ============================================================
exports.updateAbout = async (req, res) => {
  try {
    // --- тело запроса (JSON или multipart/form-data c payload) ---
    let body = {};
    if (req.is("application/json")) {
      body = req.body || {};
    } else if (req.body?.payload) {
      try {
        body = JSON.parse(req.body.payload);
      } catch {
        return res.status(400).json({ message: "Invalid payload JSON" });
      }
    } else {
      body = req.body || {};
    }

    // язык, в который записывать строки (если пришли строки)
    const lang =
      (body.lang || req.query.lang || req.headers["accept-language"] || "")
        .toString()
        .slice(0, 2);

    let doc = await AboutContent.findOne();
    if (!doc) doc = new AboutContent({});

    // --- файлы (cloudinary) ---
    if (req.files?.heroImage?.[0]?.buffer) {
      const up = await uploadFromBuffer(
        req.files.heroImage[0].buffer,
        "about/hero"
      );
      doc.heroImageUrl = up.secure_url;
    }
    if (req.files?.storeImage?.[0]?.buffer) {
      const up = await uploadFromBuffer(
        req.files.storeImage[0].buffer,
        "about/store"
      );
      doc.storeImageUrl = up.secure_url;
    }
    if (req.files?.requisitesImage?.[0]?.buffer) {
      const up = await uploadFromBuffer(
        req.files.requisitesImage[0].buffer,
        "about/requisites"
      );
      doc.requisitesImageUrl = up.secure_url;
    }

    // --- обратная совместимость с «старой» схемой (store/heading/...) ---
    if (typeof body.heading !== "undefined") body.title = body.heading;
    if (typeof body.subheading !== "undefined") body.subtitle = body.subheading;
    if (body.store && typeof body.store === "object") {
      if (typeof body.store.description !== "undefined")
        body.descriptionIntro = body.store.description;
      if (typeof body.store.address !== "undefined")
        body.address = body.store.address;
      if (typeof body.store.hours !== "undefined") body.hours = body.store.hours;
      if (typeof body.store.mapUrl !== "undefined")
        body.gmapsUrl = body.store.mapUrl;
      if (typeof body.store.imageUrl !== "undefined")
        body.storeImageUrl = body.store.imageUrl;
    }

    // --- локализованные текстовые поля (мерджим) ---
    TEXT_FIELDS.forEach((key) => {
      if (key in body) {
        doc[key] = mergeLocalized(doc[key], body[key], lang);
      }
    });

    // --- reasons (список причин) ---
    if ("reasons" in body) {
      doc.reasons = mergeLocalizedArray(doc.reasons, body.reasons, lang);
    }

    // --- нeлокализованные строки ---
    if ("gmapsUrl" in body) doc.gmapsUrl = body.gmapsUrl;
    if ("heroImageUrl" in body) doc.heroImageUrl = body.heroImageUrl;
    if ("storeImageUrl" in body) doc.storeImageUrl = body.storeImageUrl;
    if ("requisitesImageUrl" in body)
      doc.requisitesImageUrl = body.requisitesImageUrl;

    if (req.user?._id) {
      doc.updatedBy = req.user._id;
    }

    await doc.save();

    res.status(200).json({ message: "About updated", data: doc });
  } catch (err) {
    console.error("updateAbout error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
