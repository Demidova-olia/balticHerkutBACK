const Product = require("../models/productModel");
const Category = require("../models/categoryModel");
const Subcategory = require("../models/subcategoryModel");
const cloudinary = require("cloudinary").v2;
const mongoose = require("mongoose");
const { uploadToCloudinary } = require("../utils/uploadToCloudinary");
const createProduct = async (req, res) => {
  try {
    const { name, description, price, category, subcategory, stock, brand, discount, isFeatured, isActive } = req.body;

    // Валидация обязательных полей
    if (!name || name.trim().length < 3) {
      return res.status(400).json({ message: "Name is required and must be at least 3 characters" });
    }

    if (!description || description.trim().length < 10) {
      return res.status(400).json({ message: "Description is required and must be at least 10 characters" });
    }

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ message: "Price must be a number >= 0" });
    }

    const parsedStock = parseInt(stock);
    if (isNaN(parsedStock) || parsedStock < 0) {
      return res.status(400).json({ message: "Stock must be a non-negative integer" });
    }

    // Проверка категории
    if (!mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }
    const categoryDoc = await Category.findById(category);
    if (!categoryDoc) {
      return res.status(400).json({ message: "Category not found" });
    }

    // Проверка подкатегории, если есть
    let subcategoryDoc = null;
    if (subcategory) {
      if (!mongoose.Types.ObjectId.isValid(subcategory)) {
        return res.status(400).json({ message: "Invalid subcategory ID" });
      }
      subcategoryDoc = await Subcategory.findOne({ _id: subcategory, parent: category });
      if (!subcategoryDoc) {
        return res.status(400).json({ message: "Subcategory invalid or does not belong to category" });
      }
    }

    // Обработка изображений
    let images = [];
    if (req.files?.length) {
      images = await Promise.all(
        req.files.map(async (file) => {
          const result = await uploadToCloudinary(file.buffer, file.originalname);
          return { url: result.url, public_id: result.public_id };
        })
      );
    }

    // Если нет новых файлов, но есть body.images (ссылки), добавим с дефолтным public_id
    if (!images.length && req.body.images) {
      let bodyImages = req.body.images;
      if (typeof bodyImages === "string") {
        bodyImages = [bodyImages];
      }
      images = bodyImages.map((url) => ({
        url,
        public_id: "default_local_image", // дефолтный public_id для локальных изображений без загрузки в cloudinary
      }));
    }

    const product = new Product({
      name: name.trim(),
      description: description.trim(),
      price: parsedPrice,
      category,
      subcategory: subcategoryDoc?._id,
      stock: parsedStock,
      images,
      brand: brand ? brand.trim() : undefined,
      discount: discount !== undefined ? Number(discount) : undefined,
      isFeatured: isFeatured === "true" || isFeatured === true,
      isActive: isActive === "false" || isActive === false ? false : true,
    });

    await product.save();

    res.status(201).json({ message: "Product created", data: product });
  } catch (err) {
    console.error("Error in createProduct:", err);
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

    res.status(200).json({
      message: "Products fetched",
      data: { products, totalPages: Math.ceil(totalProducts / limit), totalProducts },
    });
  } catch (error) {
    console.error("Error in getProducts:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const product = await Product.findById(id)
      .populate("category")
      .populate("subcategory")
      .select("-__v");

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.status(200).json({ message: "Product fetched", data: product });
  } catch (error) {
    console.error("Error fetching product by ID:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getProductsByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const products = await Product.find({ category: categoryId });
    res.json({ message: "Products by category", data: products });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getProductsByCategoryAndSubcategory = async (req, res) => {
  try {
    const { categoryId, subcategoryId } = req.params;
    const products = await Product.find({ category: categoryId, subcategory: subcategoryId });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateProduct = async (req, res) => {
  console.log('req.body:', req.body);
  console.log('req.files:', req.files);
  res.json({ body: req.body, files: req.files });
  try {
    const { id } = req.params;
    const {
      name,
      description,
      price,
      stock,
      category,
      subcategory,
      removeAllImages,
      existingImages,
      brand,
      discount,
      isFeatured,
      isActive,
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const updates = {};

    if (name) {
      if (typeof name !== "string" || name.trim().length < 3) {
        return res.status(400).json({ message: "Name must be at least 3 characters" });
      }
      updates.name = name.trim();
    }

    if (description) {
      if (typeof description !== "string" || description.trim().length < 10) {
        return res.status(400).json({ message: "Description must be at least 10 characters" });
      }
      updates.description = description.trim();
    }

    if (price !== undefined) {
      const parsedPrice = parseFloat(price);
      if (isNaN(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: "Price must be a number >= 0" });
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
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return res.status(400).json({ message: "Invalid category ID" });
      }
      const catDoc = await Category.findById(category);
      if (!catDoc) {
        return res.status(400).json({ message: "Category not found" });
      }
      updates.category = category;
    }

    if (subcategory) {
      if (!mongoose.Types.ObjectId.isValid(subcategory)) {
        return res.status(400).json({ message: "Invalid subcategory ID" });
      }
      // Подкатегория должна принадлежать к текущей или обновляемой категории
      const parentCatId = updates.category || product.category;
      const subcatDoc = await Subcategory.findOne({ _id: subcategory, parent: parentCatId });
      if (!subcatDoc) {
        return res.status(400).json({ message: "Invalid subcategory or does not belong to category" });
      }
      updates.subcategory = subcategory;
    }

    if (brand !== undefined) {
      if (typeof brand !== "string") {
        return res.status(400).json({ message: "Brand must be a string" });
      }
      updates.brand = brand.trim();
    }

    if (discount !== undefined) {
      const parsedDiscount = Number(discount);
      if (isNaN(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100) {
        return res.status(400).json({ message: "Discount must be a number between 0 and 100" });
      }
      updates.discount = parsedDiscount;
    }

    if (isFeatured !== undefined) {
      updates.isFeatured = isFeatured === "true" || isFeatured === true;
    }

    if (isActive !== undefined) {
      updates.isActive = isActive === "true" || isActive === true;
    }

    // Работа с изображениями
    let finalImages = [];

    if (removeAllImages === "true") {
      // Удаляем картинки из cloudinary
      for (const img of product.images) {
        if (img.public_id && img.public_id !== "default_local_image") {
          await cloudinary.uploader.destroy(img.public_id);
        }
      }
      // После удаления изображений, если не добавлять новых — картинки будут пусты
    } else {
      if (existingImages) {
        try {
          // existingImages может прийти как строка JSON или уже как массив
          const parsed = typeof existingImages === "string" ? JSON.parse(existingImages) : existingImages;

          // Каждый элемент должен иметь url и public_id (если есть)
          finalImages = parsed.map((img) => {
            if (typeof img === "string") {
              // Если строка — считаем это url, добавим дефолтный public_id
              return { url: img, public_id: "default_local_image" };
            }
            if (img.url) {
              // Если public_id нет — тоже добавим дефолтный
              return {
                url: img.url,
                public_id: img.public_id || "default_local_image",
              };
            }
            return null;
          }).filter(Boolean);
        } catch {
          return res.status(400).json({ message: "Invalid existingImages format" });
        }
      }

      if (req.files?.length > 0) {
        const newImages = await Promise.all(
          req.files.map(async (file) => {
            const result = await uploadToCloudinary(file.buffer, file.originalname);
            return { url: result.url, public_id: result.public_id };
          })
        );
        finalImages = [...finalImages, ...newImages];
      }
    }

    if (finalImages.length > 0) {
      updates.images = finalImages;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No updates provided" });
    }

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

// Delete Product
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    for (const image of product.images) {
      if (image.public_id && image.public_id !== "default_local_image") {
        await cloudinary.uploader.destroy(image.public_id);
      }
    }

    const deleted = await Product.findByIdAndDelete(id);
    res.json({ message: "Product was removed", data: deleted });
  } catch (error) {
    res.status(500).send(error);
  }
};

// Delete Image
const deleteProductImage = async (req, res) => {
  try {
    const { productId, publicId } = req.params;

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const image = product.images.find((img) => img.public_id === publicId);
    if (!image) return res.status(404).json({ message: "Image not found" });

    await cloudinary.uploader.destroy(publicId);
    product.images = product.images.filter((img) => img.public_id !== publicId);
    await product.save();

    res.status(200).json({ message: "Image deleted", data: product.images });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete image" });
  }
};

// Update Image
const updateProductImage = async (req, res) => {
  try {
    const { productId, publicId } = req.params;

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const index = product.images.findIndex((img) => img.public_id === publicId);
    if (index === -1) return res.status(404).json({ message: "Image not found" });

    const file = req.file;
    if (!file) return res.status(400).json({ message: "No image uploaded" });

    await cloudinary.uploader.destroy(publicId);
    const newImage = await uploadToCloudinary(file.buffer, file.originalname);

    product.images[index] = newImage;
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
