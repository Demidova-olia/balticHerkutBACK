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

const subcategorySchema = new mongoose.Schema(
  {
    
    name: {
      type: localizedFieldSchema,
      required: true,
    },


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

subcategorySchema.index({ parent: 1, slug: 1 }, { unique: true });

subcategorySchema.pre("validate", function (next) {
  if (!this.slug) {
    const src = (this.name && this.name._source) || "en";
    const base =
      (this.name && this.name[src]) ||
      (this.name && (this.name.en || this.name.ru || this.name.fi)) ||
      "";
    this.slug = slugify(base || `subcat-${Date.now()}`);
  }
  next();
});

subcategorySchema.index({ "name.en": "text", "name.ru": "text", "name.fi": "text" });

const Subcategory = mongoose.model("Subcategory", subcategorySchema);
module.exports = Subcategory;
