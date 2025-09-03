const Product = require("../models/productModel");
const Category = require("../models/categoryModel");
const Subcategory = require("../models/subcategoryModel");
const cloudinary = require("cloudinary").v2;
const mongoose = require("mongoose");
const { uploadToCloudinary } = require("../utils/uploadToCloudinary");

/* =========================================================
 * CREATE
 * =======================================================*/
const createProduct = async (req, res) => {
  try {
    const body = req.body || {};
    const { name, description, price, category, subcategory, stock, brand, discount, isFeatured, isActive } = body;

    if (!name || String(name).trim().length < 3) {
      return res.status(400).json({ message: "Name is required and must be at least 3 characters" });
    }
    if (!description || String(description).trim().length < 10) {
      return res.status(400).json({ message: "Description is required and must be at least 10 characters" });
    }

    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ message: "Price must be a number >= 0" });
    }

    const parsedStock = Number.parseInt(stock, 10);
    if (!Number.isFinite(parsedStock) || parsedStock < 0) {
      return res.status(400).json({ message: "Stock must be a non-negative integer" });
    }

    if (!mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }
    const categoryDoc = await Category.findById(category);
    if (!categoryDoc) {
      return res.status(400).json({ message: "Category not found" });
    }

    // нормализация subcategory
    const normSub = (val) => {
      if (val == null) return undefined;
      if (typeof val !== "string") return val;
      const t = val.trim().toLowerCase();
      if (!t || t === "undefined" || t === "null") return undefined;
      return val;
    };
    let subcategoryDoc = null;
    const normalizedSubcategory = normSub(subcategory);
    if (normalizedSubcategory) {
      if (!mongoose.Types.ObjectId.isValid(normalizedSubcategory)) {
        return res.status(400).json({ message: "Invalid subcategory ID" });
      }
      subcategoryDoc = await Subcategory.findOne({ _id: normalizedSubcategory, parent: category });
      if (!subcategoryDoc) {
        return res.status(400).json({ message: "Subcategory invalid or does not belong to category" });
      }
    }

    // изображения
    let images = [];
    if (req.files?.length) {
      images = await Promise.all(
        req.files.map(async (file) => {
          const result = await uploadToCloudinary(file.buffer, file.originalname);
          return { url: result.url, public_id: result.public_id };
        })
      );
    }
    if (!images.length && body.images) {
      let bodyImages = body.images;
      if (typeof bodyImages === "string") bodyImages = [bodyImages];
      images = bodyImages.map((url) => ({
        url,
        public_id: "default_local_image",
      }));
    }

    const product = new Product({
      name: String(name).trim(),
      description: String(description).trim(),
      price: parsedPrice,
      category,
      subcategory: subcategoryDoc?._id,
      stock: parsedStock,
      images,
      brand: brand ? String(brand).trim() : undefined,
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

/* =========================================================
 * LIST
 * =======================================================*/
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
      .limit(parseInt(limit, 10));

    res.status(200).json({
      message: "Products fetched",
      data: { products, totalPages: Math.ceil(totalProducts / limit), totalProducts },
    });
  } catch (error) {
    console.error("Error in getProducts:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
 * GET BY ID
 * =======================================================*/
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

    if (!product) return res.status(404).json({ message: "Product not found" });

    res.status(200).json({ message: "Product fetched", data: product });
  } catch (error) {
    console.error("Error fetching product by ID:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
 * BY CATEGORY
 * =======================================================*/
const getProductsByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const products = await Product.find({ category: categoryId });
    res.json({ message: "Products by category", data: products });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================================================
 * BY CATEGORY + SUBCATEGORY
 * =======================================================*/
const getProductsByCategoryAndSubcategory = async (req, res) => {
  try {
    const { categoryId, subcategoryId } = req.params;
    const products = await Product.find({ category: categoryId, subcategory: subcategoryId });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================================================
 * UPDATE (устойчив к пустому req.body в multipart)
 * =======================================================*/
const updateProduct = async (req, res) => {
  try {
    const contentType = req.headers["content-type"] || "";
    console.log("[updateProduct] content-type:", contentType);

    const productId = req.params.id;
    const files = req.files || [];
    const body = req.body || {}; // КЛЮЧЕВОЕ: не падать, если body = undefined

    const {
      name, description, price, stock, category, subcategory,
      removeAllImages, existingImages
    } = body;

    // 1) базовая валидация
    if (!name || !description || category == null) {
      return res.status(400).json({ message: "Missing required fields: name/description/category" });
    }

    // 2) числа
    const parsedPrice = Number(price);
    const parsedStock = Number.isInteger(Number(stock)) ? Number(stock) : NaN;

    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ message: "Price must be a non-negative number" });
    }
    if (!Number.isFinite(parsedStock) || parsedStock < 0) {
      return res.status(400).json({ message: "Stock must be a non-negative integer" });
    }

    // 3) категория/подкатегория
    if (!mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const normSub = (val) => {
      if (val == null) return undefined;
      if (typeof val !== "string") return val;
      const t = val.trim().toLowerCase();
      if (!t || t === "undefined" || t === "null") return undefined;
      return val;
    };
    const normalizedSubcategory = normSub(subcategory);
    if (normalizedSubcategory && !mongoose.Types.ObjectId.isValid(normalizedSubcategory)) {
      return res.status(400).json({ message: "Invalid subcategory ID" });
    }

    // 4) продукт
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    product.name = String(name).trim();
    product.description = String(description).trim();
    product.price = parsedPrice;
    product.stock = parsedStock;
    product.category = category;
    product.subcategory = normalizedSubcategory || undefined; // ВАЖНО: не писать ''

    // 5) существующие изображения
    let existingImagesParsed = [];
    if (typeof existingImages !== "undefined") {
      if (Array.isArray(existingImages)) {
        existingImagesParsed = existingImages;
      } else if (typeof existingImages === "string") {
        const s = existingImages.trim();
        if (s && s !== "undefined" && s !== "null") {
          try {
            const parsed = JSON.parse(s);
            if (Array.isArray(parsed)) existingImagesParsed = parsed;
            // если пришёл объект {url, public_id}
            else if (parsed && parsed.url && parsed.public_id) {
              existingImagesParsed = [parsed];
            }
          } catch {
            if (/^https?:\/\//i.test(s)) {
              existingImagesParsed = [{ url: s, public_id: "default_local_image" }];
            }
          }
        }
      } else if (existingImages && existingImages.url && existingImages.public_id) {
        existingImagesParsed = [existingImages];
      }
    }

    const shouldRemoveAll = removeAllImages === true || removeAllImages === "true";
    if (shouldRemoveAll) {
      product.images = [];
    } else if (existingImagesParsed.length) {
      product.images = existingImagesParsed;
    }

    // 6) загрузка новых файлов в Cloudinary (если есть)
    const uploadFromBuffer = (buffer) =>
      new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "products", resource_type: "image" },
          (error, result) => (error ? reject(error) : resolve(result))
        );
        stream.end(buffer);
      });

    let newImages = [];
    if (files.length) {
      const uploadResults = await Promise.all(files.map((f) => uploadFromBuffer(f.buffer)));
      newImages = uploadResults.map((r) => ({ url: r.secure_url, public_id: r.public_id }));
    }
    if (newImages.length) {
      product.images = (product.images || []).concat(newImages);
    }

    // 7) сохраняем
    try {
      await product.save();
    } catch (e) {
      if (e.name === "ValidationError" || e.name === "CastError") {
        return res.status(400).json({ message: e.message });
      }
      throw e;
    }

    return res.status(200).json({ message: "Product updated", data: product });
  } catch (error) {
    console.error("Error in updateProduct:", error, { headers: req.headers });
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

/* =========================================================
 * SEARCH (единственная версия!)
 * =======================================================*/
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
      .populate("subcategory")
      .select("-__v")
      .sort({ createdAt: -1 });

    res.status(200).json({ message: "Search completed", data: products });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ message: "Server error during search" });
  }
};

/* =========================================================
 * DELETE PRODUCT (+ чистим Cloudinary)
 * =======================================================*/
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const toDelete = (product.images || [])
      .map((i) => i.public_id)
      .filter((pid) => pid && pid !== "default_local_image");

    await Promise.all(toDelete.map((pid) => cloudinary.uploader.destroy(pid).catch(() => null)));

    await product.deleteOne();
    res.status(200).json({ message: "Product deleted" });
  } catch (error) {
    console.error("Error in deleteProduct:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
 * DELETE ONE IMAGE
 * =======================================================*/
const deleteProductImage = async (req, res) => {
  try {
    const { productId, publicId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }
    if (!publicId) return res.status(400).json({ message: "publicId is required" });

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const existed = product.images?.some((img) => img.public_id === publicId);
    if (!existed) return res.status(404).json({ message: "Image not found on product" });

    if (publicId !== "default_local_image") {
      try { await cloudinary.uploader.destroy(publicId); } catch (_) {}
    }

    product.images = product.images.filter((img) => img.public_id !== publicId);
    await product.save();

    res.status(200).json({ message: "Image removed", data: product.images });
  } catch (error) {
    console.error("Error in deleteProductImage:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
 * UPDATE ONE IMAGE
 * =======================================================*/
const updateProductImage = async (req, res) => {
  try {
    const { productId, publicId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }
    if (!publicId) return res.status(400).json({ message: "publicId is required" });
    if (!req.file) return res.status(400).json({ message: "No image file uploaded" });

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const idx = product.images.findIndex((img) => img.public_id === publicId);
    if (idx === -1) return res.status(404).json({ message: "Image not found on product" });

    const uploadFromBuffer = (buffer) =>
      new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "products", resource_type: "image" },
          (error, result) => (error ? reject(error) : resolve(result))
        );
        stream.end(buffer);
      });

    const uploaded = await uploadFromBuffer(req.file.buffer);

    const oldPid = product.images[idx].public_id;
    if (oldPid && oldPid !== "default_local_image") {
      try { await cloudinary.uploader.destroy(oldPid); } catch (_) {}
    }

    product.images[idx] = {
      url: uploaded.secure_url,
      public_id: uploaded.public_id,
    };

    await product.save();
    res.status(200).json({ message: "Image updated", data: product.images[idx] });
  } catch (error) {
    console.error("Error in updateProductImage:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  getProductsByCategory,
  getProductsByCategoryAndSubcategory,
  updateProduct,
  searchProducts,
  deleteProduct,
  deleteProductImage,
  updateProductImage,
};
