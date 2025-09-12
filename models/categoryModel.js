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

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: localizedFieldSchema,
      required: true,
    },
    description: {
      type: localizedFieldSchema,
      default: {},
    },
    slug: {
      type: String,
      trim: true,
      unique: true,
      index: true,
    },
    image: {
      type: String,
      default: "/images/category.jpg",
    },
  },
  { timestamps: true }
);

categorySchema.pre("validate", function (next) {
  if (!this.name || typeof this.name !== "object") {
    this.name = toLocalized(this.name);
  } else {
    this.name = toLocalized(this.name);
  }

  if (typeof this.description !== "undefined") {
    this.description = toLocalized(this.description);
  }

  if (!this.slug) {
    const base =
      this.name?.[this.name?._source || "en"] ||
      this.name?.en ||
      this.name?.ru ||
      this.name?.fi ||
      `category-${Date.now()}`;
    this.slug = slugify(base);
  }
  next();
});

categorySchema.index({ "name.en": "text", "name.ru": "text", "name.fi": "text" });

const Category = mongoose.model("Category", categorySchema);
module.exports = Category;
