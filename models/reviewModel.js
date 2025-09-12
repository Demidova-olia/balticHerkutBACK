// models/reviewModel.js
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
    const base = val[src] || "";
    return {
      ru: val.ru || base,
      en: val.en || base,
      fi: val.fi || base,
      _source: src,
      _mt: val._mt || undefined,
    };
  }
  const s = String(val || "").trim();
  const src = guessSourceLang(s);
  return { ru: s, en: s, fi: s, _source: src };
}

const reviewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    comment: {
      type: localizedFieldSchema,
      default: {},
    },
  },
  { timestamps: true }
);

reviewSchema.pre("validate", function (next) {
  if (typeof this.comment !== "undefined") {
    this.comment = toLocalized(this.comment);
  }
  next();
});
reviewSchema.index({ userId: 1, productId: 1 }, { unique: true });

reviewSchema.index({ "comment.en": "text", "comment.ru": "text", "comment.fi": "text" });

module.exports = mongoose.model("Review", reviewSchema);
