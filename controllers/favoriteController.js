const mongoose = require("mongoose");
const Favorite = require("../models/favoriteModel");
const Product = require("../models/productModel");

const addFavorite = async (req, res) => {
  const userId = req.user._id;
  const { productId } = req.body;

  if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
    return res.status(400).json({ message: "Invalid product ID" });
  }

  try {
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const existing = await Favorite.findOne({ user: userId, product: productId });
    if (existing) {
      return res.status(400).json({ message: "Product already in favorites" });
    }

    const favorite = new Favorite({ user: userId, product: productId });
    await favorite.save();

    const populatedFavorite = await Favorite.findById(favorite._id).populate("product");
    res.status(201).json(populatedFavorite.product);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to add to favorites", error: err.message });
  }
};

const removeFavorite = async (req, res) => {
  const userId = req.user._id;
  const { productId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res.status(400).json({ message: "Invalid product ID" });
  }

  try {
    const removed = await Favorite.findOneAndDelete({ user: userId, product: productId });
    if (!removed) return res.status(404).json({ message: "Favorite not found or already removed" });

    res.json({ message: "Removed from favorites" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to remove favorite", error: err.message });
  }
};

const getFavorites = async (req, res) => {
  const userId = req.user._id;

  try {
    const favorites = await Favorite.find({ user: userId }).populate("product");
    res.json(favorites.map((fav) => fav.product));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch favorites", error: err.message });
  }
};

module.exports = {
  addFavorite,
  removeFavorite,
  getFavorites,
};
