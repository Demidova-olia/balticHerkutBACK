const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 2
  },
  description: {
    type: String,
    default: '',
    maxLength: 200
  },
  image: {
    type: String,
    default: 'http://localhost:3000/images/category.jpg'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;