const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
  },
  description: {
    type: String,
    required: true,
    minlength: 10,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  subcategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subcategory',
    required: true,
  },
  stock: {
    type: Number,
    required: true,
    min: 0,
  },
  averageRating: {
    type: Number,
    default: 0,
  },
  images: {
    type: [
      {
        url: { type: String, required: true },
        public_id: { type: String, required: true }
      }
    ],
    default: []
  },
  brand: {
    type: String,
    trim: true,
  },
  isFeatured: {
    type: Boolean,
    default: false,
  },
  discount: {
    type: Number,
    min: 0,
    max: 100,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;

