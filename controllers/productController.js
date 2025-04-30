const Product = require("../models/productModel");
const Category = require("../models/categoryModel");
const cloudinary = require("cloudinary").v2;

const uploadToCloudinary = (fileBuffer, filename) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder: "products",
        public_id: filename,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    ).end(fileBuffer);
  });
};

const createProduct = async (req, res) => {
  try {
    const { name, description, price, category, stock } = req.body;
    const files = req.files;

    const existingCategory = await Category.findById(category);
    if (!existingCategory) {
      return res.status(400).json({ message: "Kategorija neegzistuoja" });
    }

    let imageUrls = [];

    if (files && files.length > 0) {
      const uploads = files.map((file, index) =>
        uploadToCloudinary(file.buffer, `${Date.now()}-${index}`)
      );
      imageUrls = await Promise.all(uploads);
    } else {
      imageUrls = ["https://res.cloudinary.com/demo/image/upload/sample.jpg"];
    }

    const product = new Product({
      name,
      description,
      price,
      category,
      stock,
      images: imageUrls,
    });

    await product.save();
    res.status(201).json(product);
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({ message: "Nepavyko sukurti produkto" });
  }
};

const getProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const skip = (page - 1) * limit;
    const totalProducts = await Product.countDocuments();
    const products = await Product.find()
      .populate("category")
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalProducts / limit);

    res.send({ products, totalPages, totalProducts });
  } catch (error) {
    res.status(500).send(error);
  }
};

const getProductsByCategory = async (req, res) => {
  try {
    const categoryName = req.params.categoryName;
    const category = await Category.findOne({ name: categoryName });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    const products = await Product.find({ category: category._id }).populate("category");

    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id).populate("category");

    if (!product) {
      return res.status(404).send({ error: "Product Not found" });
    }

    res.send(product);
  } catch (error) {
    res.status(500).send(error);
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ message: "Permission denied. Only ADMIN can update" });
    }

    const { name, price, category, image } = req.body;

    if (price !== undefined && price <= 0) {
      return res.status(400).json({ message: "Price can't be 0" });
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (price !== undefined) updates.price = price;
    if (category !== undefined) updates.category = category;
    if (image !== undefined) updates.image = image;

    const updatedProduct = await Product.findByIdAndUpdate(id, updates, {
      new: true,
    }).populate("category");

    res.send(updatedProduct);
  } catch (error) {
    res.status(500).send(error);
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
      .populate("category");

    res.status(200).json(products);
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ message: "Server error during search" });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedProduct = await Product.findByIdAndDelete(id).populate("category");

    if (!deletedProduct) {
      return res.status(404).send({ error: "Product Not found" });
    }

    res.send({ message: "Product was removed", data: deletedProduct });
  } catch (error) {
    res.status(500).send(error);
  }
};

module.exports = {
  getProducts,
  getProductsByCategory,
  getProductById,
  createProduct,
  updateProduct,
  searchProducts,
  deleteProduct,
};
