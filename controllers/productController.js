const Product = require("../models/productModel");
const Category = require("../models/categoryModel");
const Subcategory = require("../models/subcategoryModel");
const cloudinary = require("../middlewares/cloudinary");
const streamifier = require("streamifier");

// Загрузка файла в Cloudinary
const uploadToCloudinary = (fileBuffer, filename) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "products",
        public_id: filename.split(".")[0],
        resource_type: "image",
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary upload error:", error);  // Логируем ошибку
          return reject(error);
        }
        resolve(result.secure_url);
      }
    );

    streamifier.createReadStream(fileBuffer).pipe(stream);
  });
};

// Создание нового продукта
const createProduct = async (req, res) => {
  try {
    const { name, description, price, category, subcategory, stock } = req.body;

    // Проверяем существование категории
    const existingCategory = await Category.findById(category);
    if (!existingCategory) {
      return res.status(400).json({ message: "Category does not exist" });
    }

    // Проверяем существование подкатегории, если она указана
    let subcategoryId = null;
    if (subcategory) {
      const existingSubcategory = await Subcategory.findOne({
        name: subcategory,
        parent: category,
      });

      if (!existingSubcategory) {
        return res.status(400).json({ message: "Subcategory does not exist or does not belong to this category" });
      }

      subcategoryId = existingSubcategory._id;
    }

    // Загружаем изображения в Cloudinary
    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      imageUrls = await Promise.all(
        req.files.map(file => uploadToCloudinary(file.buffer, file.originalname))
      );
    } else {
      imageUrls = ["http://localhost:3000/images/product.jpg"];
    }

    // Создаем продукт
    const product = new Product({
      name,
      description,
      price,
      category,
      subcategory: subcategoryId,
      stock,
      images: imageUrls,
    });

    // Сохраняем в базе данных
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({ message: "Failed to create product" });
  }
};

// Получение всех продуктов с пагинацией
const getProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const totalProducts = await Product.countDocuments();
    const products = await Product.find()
      .populate("category")
      .populate("subcategory")
      .skip(skip)
      .limit(limit);

    const totalPages = Math.ceil(totalProducts / limit);

    res.send({ products, totalPages, totalProducts });
  } catch (error) {
    res.status(500).send(error);
  }
};

// Получение продуктов по категории
const getProductsByCategory = async (req, res) => {
  try {
    const categoryName = req.params.categoryName;
    const category = await Category.findOne({ name: categoryName });

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    const products = await Product.find({ category: category._id })
      .populate("category")
      .populate("subcategory");

    res.json(products);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Получение одного продукта по ID
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id)
      .populate("category")
      .populate("subcategory");

    if (!product) {
      return res.status(404).send({ error: "Product not found" });
    }

    res.send(product);
  } catch (error) {
    res.status(500).send(error);
  }
};

// Обновление продукта
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (req.user?.role !== "ADMIN") {
      return res.status(403).json({ message: "Permission denied. Only ADMIN can update products" });
    }

    const { name, price, category, subcategory, stock } = req.body;
    const updates = {};

    // Обновление изображений
    if (req.files && req.files.length > 0) {
      updates.images = await Promise.all(
        req.files.map(file => uploadToCloudinary(file.buffer, file.originalname))
      );
    }

    if (price !== undefined && price <= 0) {
      return res.status(400).json({ message: "Price must be greater than 0" });
    }

    if (name !== undefined) updates.name = name;
    if (price !== undefined) updates.price = price;
    if (stock !== undefined) updates.stock = stock;

    if (category !== undefined) {
      const existingCategory = await Category.findById(category);
      if (!existingCategory) {
        return res.status(400).json({ message: "Category does not exist" });
      }
      updates.category = category;
    }

    if (subcategory !== undefined) {
      const parentCategory = updates.category || product.category;

      const existingSubcategory = await Subcategory.findOne({
        _id: subcategory,
        parent: parentCategory,
      });

      if (!existingSubcategory) {
        return res.status(400).json({ message: "Subcategory not found or does not belong to this category" });
      }

      updates.subcategory = subcategory;
    }

    const updatedProduct = await Product.findByIdAndUpdate(id, updates, {
      new: true,
    }).populate("category").populate("subcategory");

    res.send(updatedProduct);
  } catch (error) {
    console.error("Error updating product:", error);
    res.status(500).send({ message: "Failed to update product" });
  }
};

// Поиск продуктов
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

    res.status(200).json(products);
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ message: "Server error during search" });
  }
};

// Удаление продукта
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedProduct = await Product.findByIdAndDelete(id)
      .populate("category")
      .populate("subcategory");

    if (!deletedProduct) {
      return res.status(404).send({ error: "Product not found" });
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
