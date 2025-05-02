const Category = require("../models/categoryModel");
const Subcategory = require('../models/subcategoryModel');

const createCategory = async (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Access denied' });
  }

  try {
    const category = new Category(req.body);
    await category.save();
    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ message: "Failed to create category", error: err.message });
  }
};

const getCategories = async (req, res) => {
  try {
    const categories = await Category.find().lean();
    for (const cat of categories) {
        cat.subcategories = await Subcategory.find({ parent: cat._id });
      }
    res.json(categories);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch categories", error: err.message });
  }
};

const updateCategory = async (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Access denied' });
  }

  try {
    const category = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!category) return res.status(404).json({ message: "Category not found" });
    res.json(category);
  } catch (err) {
    res.status(500).json({ message: "Failed to update category", error: err.message });
  }
};

const deleteCategory = async (req, res) => {
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ message: 'Access denied' });
  }

  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });
    res.json({ message: "Category deleted", category });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete category", error: err.message });
  }
};
const getCategoriesWithSubcategories = async (req, res, next) => {
  try {
    const categories = await Category.find();
    const subcategories = await Subcategory.find();

    const categoriesWithSubs = categories.map(category => {
      const subs = subcategories.filter(sub => sub.parent.toString() === category._id.toString());
      return {
        ...category.toObject(),
        subcategories: subs
      };
    });

    res.status(200).json(categoriesWithSubs);
  } catch (err) {
    next(err);
  }
};
module.exports = {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  getCategoriesWithSubcategories,
};
