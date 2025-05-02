const Subcategory = require("../models/subcategoryModel");

const createSubcategory = async (req, res) => {
  try {
    const subcategory = new Subcategory(req.body);
    await subcategory.save();
    res.status(201).json(subcategory);
  } catch (err) {
    res.status(500).json({ message: "Failed to create subcategory", error: err.message });
  }
};

const getSubcategories = async (req, res) => {
  try {
    const subcategories = await Subcategory.find().populate('parent');
    res.json(subcategories);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch subcategories", error: err.message });
  }
};

const updateSubcategory = async (req, res) => {
  try {
    const subcategory = await Subcategory.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!subcategory) return res.status(404).json({ message: "Subcategory not found" });
    res.json(subcategory);
  } catch (err) {
    res.status(500).json({ message: "Failed to update subcategory", error: err.message });
  }
};

const deleteSubcategory = async (req, res) => {
  try {
    const subcategory = await Subcategory.findByIdAndDelete(req.params.id);
    if (!subcategory) return res.status(404).json({ message: "Subcategory not found" });
    res.json({ message: "Subcategory deleted", subcategory });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete subcategory", error: err.message });
  }
};

module.exports = {
  createSubcategory,
  getSubcategories,
  updateSubcategory,
  deleteSubcategory,
};
