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


function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .trim()

    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

const categorySchema = new mongoose.Schema(
  {
    /** Локализованное имя */
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
  if (!this.slug) {
    const src = (this.name && this.name._source) || "en";
    const base =
      (this.name && this.name[src]) ||
      (this.name && (this.name.en || this.name.ru || this.name.fi)) ||
      "";
    this.slug = slugify(base || `category-${Date.now()}`);
  }
  next();
});

categorySchema.index({ "name.en": "text", "name.ru": "text", "name.fi": "text" });

const Category = mongoose.model("Category", categorySchema);
module.exports = Category;
