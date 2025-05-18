const Product = require("../models/productModel");
const Category = require("../models/categoryModel");
const Subcategory = require("../models/subcategoryModel");
const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");
const path = require("path");
const mongoose = require("mongoose");
const { uploadToCloudinary } = require("../utils/cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadToCloudinary = (fileBuffer, filename) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "products",
        resource_type: "image",
        public_id: filename.split(".")[0],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          url: result.secure_url,
          public_id: result.public_id,
        });
      }
    );
    streamifier.createReadStream(fileBuffer).pipe(stream);
  });
};

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
      subcategoryDoc = await Subcategory.findOne({
        _id: subcategory,
        parent: category,
      });
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
    res.status(201).json({ message: "Product created", data: product });
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
    if (category) {
      query.category = category;
    }

    if (subcategory) {
      query.subcategory = subcategory;
    }

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

    res.status(200).json({ message: "Products fetched", data: { products, totalPages, totalProducts } });
  } catch (error) {
    console.error("Error in getProducts:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getProductsByCategory = async (req, res) => {
  const { categoryId } = req.params;

  try {
    const products = await Product.find({ category: categoryId });
    res.json({ message: "Products by category", data: products });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getProductsByCategoryAndSubcategory = async (req, res) => {
  const { categoryId, subcategoryId } = req.params;

  try {
    const products = await Product.find({
      category: categoryId,
      subcategory: subcategoryId,
    }).exec();
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
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

    res.status(200).json({ message: "Product fetched", data: product });
  } catch (error) {
    console.error("Error fetching product by ID:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, stock, category, subcategory, removeAllImages, existingImages } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const updates = {};

    if (name) updates.name = name;

    if (price !== undefined) {
      const parsedPrice = parseFloat(price);
      if (isNaN(parsedPrice) || parsedPrice <= 0) {
        return res.status(400).json({ message: "Price must be a positive number" });
      }
      updates.price = parsedPrice;
    }

    if (stock !== undefined) {
      const parsedStock = parseInt(stock);
      if (isNaN(parsedStock) || parsedStock < 0) {
        return res.status(400).json({ message: "Stock must be a non-negative integer" });
      }
      updates.stock = parsedStock;
    }

    if (category) {
      const categoryDoc = await Category.findById(category);
      if (!categoryDoc) {
        return res.status(400).json({ message: "Invalid category" });
      }
      updates.category = category;
    }

    if (subcategory) {
      const subcat = await Subcategory.findOne({
        _id: subcategory,
        parent: updates.category || product.category,
      });
      if (!subcat) {
        return res.status(400).json({ message: "Invalid subcategory" });
      }
      updates.subcategory = subcategory;
    }

    let finalImages = [];

    if (removeAllImages === "true") {
      for (const img of product.images) {
        if (img.public_id) {
          await cloudinary.uploader.destroy(img.public_id);
        }
      }
    } else {
      if (existingImages) {
        try {
          const parsed = JSON.parse(existingImages);
          finalImages = parsed.filter(img => img.url && img.public_id);
        } catch {
          return res.status(400).json({ message: "Invalid existingImages format" });
        }
      }

      if (req.files?.length) {
        const newImages = await Promise.all(
          req.files.map(file => uploadToCloudinary(file.buffer, file.originalname))
        );
        finalImages = [...finalImages, ...newImages];
      }
    }

    updates.images = finalImages;

    const updatedProduct = await Product.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({ message: "Product updated", data: updatedProduct });
  } catch (err) {
    console.error("Error in updateProduct:", err);
    res.status(500).json({ message: "Failed to update product" });
  }
};



const searchProducts = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim() === "") {
      return res.status(400).json({ message: 'Query parameter "q" is required' });
    }

    const regex = new RegExp(q, "i");

    const products = await Product.find({
      $or: [{ name: regex }, { description: regex }],
    })
      .limit(30)
      .populate("category")
      .populate("subcategory");

    res.status(200).json({ message: "Search completed", data: products });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ message: "Server error during search" });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

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

    res.status(200).json({ message: "Image deleted", data: product.images });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete image" });
  }
};

const updateProductImage = async (req, res) => {
  const { productId, publicId } = req.params;

  try {
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const imageIndex = product.images.findIndex(img => img.public_id === publicId);
    if (imageIndex === -1) return res.status(404).json({ message: "Image not found" });

    const file = req.file;
    if (!file) return res.status(400).json({ message: "No image uploaded" });

    await cloudinary.uploader.destroy(publicId);

    const newImage = await uploadToCloudinary(file.buffer, file.originalname);
    product.images[imageIndex] = newImage;

    await product.save();
    res.status(200).json({ message: "Image updated", data: newImage });
  } catch (err) {
    res.status(500).json({ message: "Failed to update image" });
  }
};

module.exports = {
  getProducts,
  getProductsByCategory,
  getProductsByCategoryAndSubcategory,
  getProductById,
  createProduct,
  updateProduct,
  searchProducts,
  deleteProduct,
  deleteProductImage,
  updateProductImage,
};
