// controllers/categoryController.js
const mongoose = require("mongoose");
const Category = require("../models/categoryModel");
const Subcategory = require("../models/subcategoryModel");

const {
  buildLocalizedField,
  updateLocalizedField,
  pickLangFromReq,
  pickLocalized,
} = require("../utils/translator");

/* =========================
 * CREATE
 * =======================*/
const createCategory = async (req, res) => {
  if (!req.user || String(req.user.role).toUpperCase() !== "ADMIN") {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const { name, description, ...rest } = req.body || {};
    if (!name || String(name).trim().length < 2) {
      return res
        .status(400)
        .json({ message: "Name is required and must be at least 2 characters" });
    }

    const doc = new Category({
      ...rest,
      name: await buildLocalizedField(String(name).trim()),
      description: description ? await buildLocalizedField(String(description).trim()) : undefined,
    });

    await doc.save();

    // Вернём локализованную версию + i18n-объекты
    const want = pickLangFromReq(req);
    const o = doc.toObject();
    o.name_i18n = o.name;
    o.description_i18n = o.description;
    o.name = pickLocalized(o.name, want);
    o.description = pickLocalized(o.description, want);

    return res.status(201).json(o);
  } catch (err) {
    console.error("createCategory error:", err);
    return res.status(500).json({ message: "Failed to create category", error: err.message });
  }
};

/* =========================
 * LIST + subcategories
 * =======================*/
const getCategories = async (req, res) => {
  try {
    const want = pickLangFromReq(req);

    const categories = await Category.find().lean();
    const result = await Promise.all(
      categories.map(async (cat) => {
        const subs = await Subcategory.find({ parent: cat._id }).lean();

        // Локализация самой категории
        const catOut = { ...cat };
        catOut.name_i18n = catOut.name;
        catOut.description_i18n = catOut.description;
        catOut.name = pickLocalized(catOut.name, want);
        catOut.description = pickLocalized(catOut.description, want);

        // Локализация подкатегорий
        catOut.subcategories = subs.map((s) => {
          const sOut = { ...s };
          sOut.name_i18n = sOut.name;
          sOut.description_i18n = sOut.description;
          sOut.name = pickLocalized(sOut.name, want);
          sOut.description = pickLocalized(sOut.description, want);
          return sOut;
        });

        return catOut;
      })
    );

    return res.json(result);
  } catch (err) {
    console.error("getCategories error:", err);
    return res.status(500).json({ message: "Failed to fetch categories", error: err.message });
  }
};

/* =========================
 * UPDATE
 * =======================*/
const updateCategory = async (req, res) => {
  if (!req.user || String(req.user.role).toUpperCase() !== "ADMIN") {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    const { name, description, ...rest } = req.body || {};
    const cat = await Category.findById(id);
    if (!cat) return res.status(404).json({ message: "Category not found" });

    // Обновляем обычные поля
    Object.assign(cat, rest);

    // Обновляем i18n-поля
    if (typeof name !== "undefined") {
      if (String(name).trim().length < 2) {
        return res.status(400).json({ message: "Name must be at least 2 characters" });
      }
      cat.name = await updateLocalizedField(cat.name, String(name).trim());
    }
    if (typeof description !== "undefined") {
      const val = String(description || "").trim();
      cat.description = val ? await updateLocalizedField(cat.description, val) : undefined;
    }

    await cat.save();

    const want = pickLangFromReq(req);
    const o = cat.toObject();
    o.name_i18n = o.name;
    o.description_i18n = o.description;
    o.name = pickLocalized(o.name, want);
    o.description = pickLocalized(o.description, want);

    return res.json(o);
  } catch (err) {
    console.error("updateCategory error:", err);
    return res.status(500).json({ message: "Failed to update category", error: err.message });
  }
};

/* =========================
 * DELETE
 * =======================*/
const deleteCategory = async (req, res) => {
  if (!req.user || String(req.user.role).toUpperCase() !== "ADMIN") {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid category id" });
    }

    const category = await Category.findByIdAndDelete(id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    // При желании можно также удалить связанные подкатегории:
    // await Subcategory.deleteMany({ parent: id });

    return res.json({ message: "Category deleted", categoryId: id });
  } catch (err) {
    console.error("deleteCategory error:", err);
    return res.status(500).json({ message: "Failed to delete category", error: err.message });
  }
};

/* =========================
 * LIST (batched) categories + subcategories
 * =======================*/
const getCategoriesWithSubcategories = async (req, res, next) => {
  try {
    const want = pickLangFromReq(req);

    const [categories, subcategories] = await Promise.all([
      Category.find().lean(),
      Subcategory.find().lean(),
    ]);

    const categoriesWithSubs = categories.map((cat) => {
      const subs = subcategories
        .filter((s) => String(s.parent) === String(cat._id))
        .map((s) => {
          const sOut = { ...s };
          sOut.name_i18n = sOut.name;
          sOut.description_i18n = sOut.description;
          sOut.name = pickLocalized(sOut.name, want);
          sOut.description = pickLocalized(sOut.description, want);
          return sOut;
        });

      const catOut = { ...cat, subcategories: subs };
      catOut.name_i18n = catOut.name;
      catOut.description_i18n = catOut.description;
      catOut.name = pickLocalized(catOut.name, want);
      catOut.description = pickLocalized(catOut.description, want);

      return catOut;
    });

    return res.status(200).json(categoriesWithSubs);
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  getCategoriesWithSubcategories,
};
