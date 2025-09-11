// controllers/subcategoryController.js
const mongoose = require("mongoose");
const Subcategory = require("../models/subcategoryModel");
const Category = require("../models/categoryModel");

const {
  buildLocalizedField,
  updateLocalizedField,
  pickLangFromReq,
  pickLocalized,
} = require("../utils/translator");

/* =========================
 * CREATE
 * =======================*/
const createSubcategory = async (req, res) => {
  // Только админ
  if (!req.user || String(req.user.role).toUpperCase() !== "ADMIN") {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const { name, description, parent, ...rest } = req.body || {};

    if (!name || String(name).trim().length < 2) {
      return res
        .status(400)
        .json({ message: "Name is required and must be at least 2 characters" });
    }

    if (!parent || !mongoose.Types.ObjectId.isValid(parent)) {
      return res.status(400).json({ message: "Valid parent category id is required" });
    }
    const par = await Category.findById(parent);
    if (!par) return res.status(400).json({ message: "Parent category not found" });

    const doc = new Subcategory({
      ...rest,
      parent,
      name: await buildLocalizedField(String(name).trim()),
      description: description ? await buildLocalizedField(String(description).trim()) : undefined,
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

/* =========================
 * LIST (с родителем) — локализуем
 * =======================*/
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
  // Только админ
  if (!req.user || String(req.user.role).toUpperCase() !== "ADMIN") {
    return res.status(403).json({ message: "Access denied" });
  }

  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid subcategory ID" });
  }

  try {
    const { name, description, parent, ...rest } = req.body || {};
    const sub = await Subcategory.findById(id);
    if (!sub) return res.status(404).json({ message: "Subcategory not found" });

    // простые поля
    Object.assign(sub, rest);

    // смена родителя (опционально)
    if (typeof parent !== "undefined") {
      if (!parent || !mongoose.Types.ObjectId.isValid(parent)) {
        return res.status(400).json({ message: "Invalid parent category id" });
      }
      const par = await Category.findById(parent);
      if (!par) return res.status(400).json({ message: "Parent category not found" });
      sub.parent = parent;
    }

    // i18n поля
    if (typeof name !== "undefined") {
      const val = String(name).trim();
      if (val.length < 2) {
        return res.status(400).json({ message: "Name must be at least 2 characters" });
      }
      sub.name = await updateLocalizedField(sub.name, val);
    }
    if (typeof description !== "undefined") {
      const val = String(description || "").trim();
      sub.description = val ? await updateLocalizedField(sub.description, val) : undefined;
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
  // Только админ
  if (!req.user || String(req.user.role).toUpperCase() !== "ADMIN") {
    return res.status(403).json({ message: "Access denied" });
  }

  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid subcategory ID" });
  }

  try {
    const sub = await Subcategory.findByIdAndDelete(id);
    if (!sub) {
      return res.status(404).json({ message: "Subcategory not found" });
    }
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
