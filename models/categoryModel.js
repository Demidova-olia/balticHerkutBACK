const mongoose = require("mongoose");

const localizedFieldSchema = new mongoose.Schema(
  {
    ru: { type: String, trim: true, default: "" },
    en: { type: String, trim: true, default: "" },
    fi: { type: String, trim: true, default: "" },
    _source: { type: String, enum: ["ru", "en", "fi"], default: "en" },
    // Map<boolean>, как в продукте, чтобы было единообразно
    _mt: { type: Map, of: Boolean, default: {} },
  },
  { _id: false }
);

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

// Фиксированное fallback-имя, если вдруг совсем пусто
const FALLBACK_NAME = {
  ru: "Импортировано",
  en: "Imported",
  fi: "Tuotu",
  _source: "en",
  _mt: {},
};

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: localizedFieldSchema,
      required: true,
    },
    description: {
      type: localizedFieldSchema,
      default: () => ({
        ru: "",
        en: "",
        fi: "",
        _source: "en",
        _mt: {},
      }),
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

    erplyGroupId: {
      type: Number,
      index: true,
      sparse: true,
    },

    erplyGroupName: {
      type: String,
      trim: true,
    },

    createdFromErply: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    autoIndex: false,
  }
);

categorySchema.pre("validate", function (next) {
  // если по какой-то причине name пустой — подставляем FALLBACK_NAME
  const n = this.name || {};
  const isEmptyName =
    !n?.ru?.trim() &&
    !n?.en?.trim() &&
    !n?.fi?.trim();

  if (isEmptyName) {
    this.name = FALLBACK_NAME;
  }

  // нормализуем описание, если вообще не было
  if (!this.description) {
    this.description = {
      ru: "",
      en: "",
      fi: "",
      _source: "en",
      _mt: {},
    };
  }

  // если нет slug — генерируем из name
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

categorySchema.index({
  "name.en": "text",
  "name.ru": "text",
  "name.fi": "text",
});

const Category = mongoose.model("Category", categorySchema);
module.exports = Category;

