const Product = require("../models/productModel");
const Category = require("../models/categoryModel");
const Subcategory = require("../models/subcategoryModel");
const cloudinary = require("../config/cloudinary");
const uploadToCloudinary = require("../middlewares/uploadToCloudinary");
const mongoose = require("mongoose");

const createProduct = async (req, res) => {
  try {
    const { name, description, price, category, subcategory, stock } = req.body;

    if (!mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const categoryDoc = await Category.findById(category);
    if (!categoryDoc) {
      return res.status(400).json({ message: "Category not found" });
    }

    let subcategoryDoc = null;
    if (subcategory) {
      subcategoryDoc = await Subcategory.findOne({ _id: subcategory, parent: category });
      if (!subcategoryDoc) {
        return res.status(400).json({ message: "Subcategory invalid or does not belong to category" });
      }
    }

    let images = [];
    if (req.files?.length) {
      images = await Promise.all(
        req.files.map(file => uploadToCloudinary(file.buffer, file.originalname))
      );
    }

    const product = new Product({
      name,
      description,
      price,
      category,
      subcategory: subcategoryDoc?._id,
      stock,
      images,
    });

    await product.save();
    res.status(201).json(product);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to create product" });
  }
};

const getProducts = async (req, res) => {
  try {
    const { search, category, subcategory, page = 1, limit = 10 } = req.query;

    const query = {};

    if (search) {
      const regex = new RegExp(search, "i");
      query.$or = [{ name: regex }, { description: regex }];
    }

    if (category) query.category = category;
    if (subcategory) query.subcategory = subcategory;

    const skip = (page - 1) * limit;
    const totalProducts = await Product.countDocuments(query);

    const products = await Product.find(query)
      .populate("category")
      .populate("subcategory")
      .select("-__v")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalPages = Math.ceil(totalProducts / limit);

    res.status(200).json({ products, totalPages, totalProducts });
  } catch (error) {
    console.error("Error in getProducts:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id)
      .populate("category")
      .populate("subcategory")
      .select("-__v");

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.status(200).json(product);
  } catch (error) {
    console.error("Error fetching product by ID:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, stock, category, subcategory } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const updates = {};

    if (name) updates.name = name;
    if (price !== undefined) {
      if (price <= 0) return res.status(400).json({ message: "Price must be positive" });
      updates.price = price;
    }
    if (stock !== undefined) updates.stock = stock;

    if (category) {
      const categoryDoc = await Category.findById(category);
      if (!categoryDoc) return res.status(400).json({ message: "Invalid category" });
      updates.category = category;
    }

    if (subcategory) {
      const subcat = await Subcategory.findOne({ _id: subcategory, parent: updates.category || product.category });
      if (!subcat) return res.status(400).json({ message: "Invalid subcategory" });
      updates.subcategory = subcategory;
    }

    if (req.files?.length) {
      for (const img of product.images) {
        await cloudinary.uploader.destroy(img.public_id);
      }

      updates.images = await Promise.all(
        req.files.map(file => uploadToCloudinary(file.buffer, file.originalname))
      );
    }

    const updated = await Product.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    res.status(200).json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to update product" });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Удаляем изображения из Cloudinary
    for (const image of product.images) {
      try {
        if (image.public_id && image.public_id !== "default_local_image") {
          await cloudinary.uploader.destroy(image.public_id);
        }
      } catch (err) {
        console.error(`❌ Failed to delete image ${image.public_id}`, err);
      }
    }

    const deletedProduct = await Product.findByIdAndDelete(id);

    res.send({ message: "Product was removed", data: deletedProduct });
  } catch (error) {
    res.status(500).send(error);
  }
};

// ✅ DELETE ONE IMAGE
const deleteProductImage = async (req, res) => {
  const { productId, publicId } = req.params;
  try {
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const image = product.images.find(img => img.public_id === publicId);
    if (!image) return res.status(404).json({ message: "Image not found" });

    await cloudinary.uploader.destroy(publicId);
    product.images = product.images.filter(img => img.public_id !== publicId);
    await product.save();

    res.status(200).json({ message: "Image deleted", images: product.images });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete image" });
  }
};

// ✅ REPLACE ONE IMAGE
const updateProductImage = async (req, res) => {
  const { productId, publicId } = req.params;

  try {
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const imageIndex = product.images.findIndex(img => img.public_id === publicId);
    if (imageIndex === -1) return res.status(404).json({ message: "Image not found" });

    const file = req.file;
    if (!file) return res.status(400).json({ message: "No image uploaded" });

    // Удаляем старую картинку
    await cloudinary.uploader.destroy(publicId);

    // Загружаем новую
    const newImage = await uploadToCloudinary(file.buffer, file.originalname);
    product.images[imageIndex] = newImage;

    await product.save();
    res.status(200).json({ message: "Image updated", image: newImage });
  } catch (err) {
    res.status(500).json({ message: "Failed to update image" });
  }
};

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  deleteProductImage,
  updateProductImage,
};
