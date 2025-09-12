// models/subcategoryModel.js
const mongoose = require("mongoose");

const localizedFieldSchema = new mongoose.Schema(
  {
    ru: { type: String, trim: true },
    en: { type: String, trim: true },
    fi: { type: String, trim: true },
    _source: { type: String, enum: ["ru", "en", "fi"], default: "en" },
    _mt: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

function guessSourceLang(s) {
  const str = String(s || "");
  if (/[А-Яа-яЁё]/.test(str)) return "ru";
  return "en";
}

function toLocalized(val) {
  if (val && typeof val === "object" && (val.ru || val.en || val.fi)) {
    const src =
      typeof val._source === "string" && ["ru", "en", "fi"].includes(val._source)
        ? val._source
        : (val.en && "en") || (val.ru && "ru") || (val.fi && "fi") || "en";
    return {
      ru: val.ru || val[src] || "",
      en: val.en || val[src] || "",
      fi: val.fi || val[src] || "",
      _source: src,
      _mt: val._mt || undefined,
    };
  }
  const s = String(val || "").trim();
  const src = guessSourceLang(s);
  return { ru: s, en: s, fi: s, _source: src };
}

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

const subcategorySchema = new mongoose.Schema(
  {
    name: {
      type: localizedFieldSchema,
      required: true,
    },

    description: {
      type: localizedFieldSchema,
      default: {},
    },

    // Родительская категория
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },

    slug: {
      type: String,
      trim: true,
      required: true,
    },
  },
  { timestamps: true }
);

subcategorySchema.pre("validate", function (next) {
  this.name = toLocalized(this.name);
  if (typeof this.description !== "undefined") {
    this.description = toLocalized(this.description);
  }

  if (!this.slug) {
    const base =
      this.name?.[this.name?._source || "en"] ||
      this.name?.en ||
      this.name?.ru ||
      this.name?.fi ||
      `subcat-${Date.now()}`;
    this.slug = slugify(base);
  }
  next();
});

subcategorySchema.index({ parent: 1, slug: 1 }, { unique: true });

subcategorySchema.index({ "name.en": "text", "name.ru": "text", "name.fi": "text" });

module.exports = mongoose.model("Subcategory", subcategorySchema);
