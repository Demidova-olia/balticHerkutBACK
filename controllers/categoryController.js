const mongoose = require("mongoose");
const Category = require("../models/categoryModel");
const Subcategory = require("../models/subcategoryModel");

const {
  buildLocalizedField,
  updateLocalizedField,
  pickLangFromReq,
  pickLocalized,
} = require("../utils/translator");

/** Универсальная нормализация локализованного поля из body */
function normalizeLocalizedFromBody(body, fieldName) {
  const raw = body?.[fieldName];

  const fallback = (s) => ({
    ru: s,
    en: s,
    fi: s,
    _source: /[А-Яа-яЁё]/.test(s) ? "ru" : "en",
  });

  // 1) пришёл объект { ru, en, fi }
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

  // 2) пришли nameRu/nameEn/nameFi
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

  // 3) пришла строка -> во все языки
  if (typeof raw === "string") {
    const s = raw.trim();
    return fallback(s);
  }

  // 4) ничего не пришло — вернуть undefined (чтобы не затирать)
  return undefined;
}

/* =========================
 * CREATE
 * =======================*/
const createCategory = async (req, res) => {
  if (!req.user || String(req.user.role).toUpperCase() !== "ADMIN") {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const { image, ...rest } = req.body || {};

    // нормализуем локализованные поля
    const nameLoc = normalizeLocalizedFromBody(req.body, "name");
    const descLoc = normalizeLocalizedFromBody(req.body, "description");

    if (!nameLoc || !nameLoc.en?.trim()) {
      return res
        .status(400)
        .json({ message: "Name is required and must be at least 2 characters" });
    }

    const doc = new Category({
      ...rest,
      image: image || "/images/category.jpg",
      name: nameLoc,                       // локализованный объект
      description: descLoc || {},          // локализованный или пустой
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

        const catOut = { ...cat };
        catOut.name_i18n = catOut.name;
        catOut.description_i18n = catOut.description;
        catOut.name = pickLocalized(catOut.name, want);
        catOut.description = pickLocalized(catOut.description, want);

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

    const cat = await Category.findById(id);
    if (!cat) return res.status(404).json({ message: "Category not found" });

    // обновим обычные поля (кроме локализованных)
    const { name, description, nameRu, nameEn, nameFi, descriptionRu, descriptionEn, descriptionFi, ...rest } = req.body || {};
    Object.assign(cat, rest);

    // локализованные поля: принимаем string / object / nameRu|nameEn|nameFi
    const nameLoc = normalizeLocalizedFromBody(
      { name, nameRu, nameEn, nameFi },
      "name"
    );
    const descLoc = normalizeLocalizedFromBody(
      { description, descriptionRu, descriptionEn, descriptionFi },
      "description"
    );

    if (typeof nameLoc !== "undefined") {
      // аккуратно мерджим, чтобы не потерять существующие значения, если пришло пустое
      cat.name = {
        ru: nameLoc.ru || cat.name?.ru || "",
        en: nameLoc.en || cat.name?.en || "",
        fi: nameLoc.fi || cat.name?.fi || "",
        _source: nameLoc._source || cat.name?._source || "en",
      };
    }

    if (typeof descLoc !== "undefined") {
      cat.description = {
        ru: (descLoc.ru ?? cat.description?.ru) || "",
        en: (descLoc.en ?? cat.description?.en) || "",
        fi: (descLoc.fi ?? cat.description?.fi) || "",
        _source: descLoc._source || cat.description?._source || "en",
      };
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
