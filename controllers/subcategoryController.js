// controllers/subcategoryController.js
const mongoose = require("mongoose");
const Subcategory = require("../models/subcategoryModel");
const Category = require("../models/categoryModel");

const {
  pickLangFromReq,
  pickLocalized,
} = require("../utils/translator");

function normalizeLocalizedFromBody(body, fieldName) {
  const raw = body?.[fieldName];

  const fallback = (s) => ({
    ru: s,
    en: s,
    fi: s,
    _source: /[А-Яа-яЁё]/.test(s) ? "ru" : "en",
  });

  if (raw && typeof raw === "object") {
    const src =
      typeof raw._source === "string" && ["ru", "en", "fi"].includes(raw._source)
        ? raw._source
        : (raw.en && "en") || (raw.ru && "ru") || (raw.fi && "fi") || "en";
    const base = raw[src] || "";
    return {
      ru: raw.ru || base,
      en: raw.en || base,
      fi: raw.fi || base,
      _source: src,
    };
  }

  const ru = body?.[`${fieldName}Ru`];
  const en = body?.[`${fieldName}En`];
  const fi = body?.[`${fieldName}Fi`];
  if (ru || en || fi) {
    const src = en ? "en" : ru ? "ru" : fi ? "fi" : "en";
    const base = (src === "en" ? en : src === "ru" ? ru : fi) || "";
    return {
      ru: ru || base,
      en: en || base,
      fi: fi || base,
      _source: src,
    };
  }

  if (typeof raw === "string") {
    const s = raw.trim();
    return fallback(s);
  }

  return undefined;
}

/* =========================
 * CREATE
 * =======================*/
const createSubcategory = async (req, res) => {
  if (!req.user || String(req.user.role).toUpperCase() !== "ADMIN") {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const { parent, ...rest } = req.body || {};

    if (!parent || !mongoose.Types.ObjectId.isValid(parent)) {
      return res.status(400).json({ message: "Valid parent category id is required" });
    }
    const par = await Category.findById(parent);
    if (!par) return res.status(400).json({ message: "Parent category not found" });

    const nameLoc = normalizeLocalizedFromBody(req.body, "name");
    if (!nameLoc || !nameLoc.en?.trim()) {
      return res
        .status(400)
        .json({ message: "Name is required and must be at least 2 characters" });
    }
    const descLoc = normalizeLocalizedFromBody(req.body, "description");

    const doc = new Subcategory({
      ...rest,
      parent,
      name: nameLoc,
      description: descLoc || {},
    });

    await doc.save();

    const want = pickLangFromReq(req);
    const o = doc.toObject();
    o.name_i18n = o.name;
    o.description_i18n = o.description;
    o.name = pickLocalized(o.name, want);
    o.description = pickLocalized(o.description, want);

    return res.status(201).json(o);
  } catch (err) {
    console.error("createSubcategory error:", err);
    return res
      .status(500)
      .json({ message: "Failed to create subcategory", error: err.message });
  }
};

const getSubcategories = async (req, res) => {
  try {
    const want = pickLangFromReq(req);

    const subs = await Subcategory.find().populate("parent").lean();
    const out = subs.map((s) => {
      const o = { ...s };
      o.name_i18n = o.name;
      o.description_i18n = o.description;
      o.name = pickLocalized(o.name, want);
      o.description = pickLocalized(o.description, want);

      if (o.parent && typeof o.parent === "object") {
        const p = { ...o.parent };
        p.name_i18n = p.name;
        p.description_i18n = p.description;
        p.name = pickLocalized(p.name, want);
        p.description = pickLocalized(p.description, want);
        o.parent = p;
      }

      return o;
    });

    return res.json(out);
  } catch (err) {
    console.error("getSubcategories error:", err);
    return res
      .status(500)
      .json({ message: "Failed to fetch subcategories", error: err.message });
  }
};

/* =========================
 * UPDATE
 * =======================*/
const updateSubcategory = async (req, res) => {
  if (!req.user || String(req.user.role).toUpperCase() !== "ADMIN") {
    return res.status(403).json({ message: "Access denied" });
  }

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid subcategory ID" });
  }

  try {
    const sub = await Subcategory.findById(id);
    if (!sub) return res.status(404).json({ message: "Subcategory not found" });

    const { parent, name, nameRu, nameEn, nameFi, description, descriptionRu, descriptionEn, descriptionFi, ...rest } =
      req.body || {};

    Object.assign(sub, rest);

    if (typeof parent !== "undefined") {
      if (!parent || !mongoose.Types.ObjectId.isValid(parent)) {
        return res.status(400).json({ message: "Invalid parent category id" });
      }
      const par = await Category.findById(parent);
      if (!par) return res.status(400).json({ message: "Parent category not found" });
      sub.parent = parent;
    }

    const nameLoc = normalizeLocalizedFromBody({ name, nameRu, nameEn, nameFi }, "name");
    if (typeof nameLoc !== "undefined") {
      sub.name = {
        ru: nameLoc.ru || sub.name?.ru || "",
        en: nameLoc.en || sub.name?.en || "",
        fi: nameLoc.fi || sub.name?.fi || "",
        _source: nameLoc._source || sub.name?._source || "en",
      };
    }

    const descLoc = normalizeLocalizedFromBody(
      { description, descriptionRu, descriptionEn, descriptionFi },
      "description"
    );
    if (typeof descLoc !== "undefined") {
      sub.description = {
        ru: (descLoc.ru ?? sub.description?.ru) || "",
        en: (descLoc.en ?? sub.description?.en) || "",
        fi: (descLoc.fi ?? sub.description?.fi) || "",
        _source: descLoc._source || sub.description?._source || "en",
      };
    }

    await sub.save();

    const want = pickLangFromReq(req);
    const o = sub.toObject();
    o.name_i18n = o.name;
    o.description_i18n = o.description;
    o.name = pickLocalized(o.name, want);
    o.description = pickLocalized(o.description, want);

    return res.json(o);
  } catch (err) {
    console.error("updateSubcategory error:", err);
    return res
      .status(500)
      .json({ message: "Failed to update subcategory", error: err.message });
  }
};

/* =========================
 * DELETE
 * =======================*/
const deleteSubcategory = async (req, res) => {
  if (!req.user || String(req.user.role).toUpperCase() !== "ADMIN") {
    return res.status(403).json({ message: "Access denied" });
  }

  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid subcategory ID" });
  }

  try {
    const sub = await Subcategory.findByIdAndDelete(id);
    if (!sub) return res.status(404).json({ message: "Subcategory not found" });
    return res.json({ message: "Subcategory deleted", subcategoryId: id });
  } catch (err) {
    console.error("deleteSubcategory error:", err);
    return res
      .status(500)
      .json({ message: "Failed to delete subcategory", error: err.message });
  }
};

module.exports = {
  createSubcategory,
  getSubcategories,
  updateSubcategory,
  deleteSubcategory,
};
