const mongoose = require('mongoose');

const LocalizedStringSchema = new mongoose.Schema(
  {
    ru: { type: String, default: "" },
    en: { type: String, default: "" },
    fi: { type: String, default: "" },
    _source: { type: String, enum: ["ru", "en", "fi"], default: "en" },
    _mt: { type: Map, of: Boolean, default: {} },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: LocalizedStringSchema, required: true },
    description: { type: LocalizedStringSchema, required: true },

    price: { type: Number, required: true, min: 0 },

    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcategory' },

    stock: { type: Number, required: true, min: 0 },

    barcode: {
      type: String,    
      trim: true,
      sparse: true,    
      unique: true,   
      match: [/^\d{8,14}$/, "Invalid barcode: expected 8–14 digits"], 
    },

    averageRating: { type: Number, default: 0 },

    images: {
      type: [
        {
          url: { type: String, required: true },
          public_id: { type: String, required: true },
        },
      ],
      default: [],
    },

    brand: { type: String, trim: true },
    isFeatured: { type: Boolean, default: false },
    discount: { type: Number, min: 0, max: 100 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

productSchema.index({ barcode: 1 }, { unique: true, sparse: true });

const Product = mongoose.model('Product', productSchema);
module.exports = Product;
