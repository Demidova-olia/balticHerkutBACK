const Product = require("../models/productModel");
const Category = require("../models/categoryModel");
const Subcategory = require("../models/subcategoryModel");
const cloudinary = require("cloudinary").v2;
const mongoose = require("mongoose");
const { uploadToCloudinary } = require("../utils/uploadToCloudinary");

const {
  buildLocalizedField,
  updateLocalizedField,
  pickLangFromReq,
  pickLocalized,
} = require("../utils/translator");

/* =========================================================
 * CREATE
 * =======================================================*/
const createProduct = async (req, res) => {
  try {
    const body = req.body || {};
    const {
      name,
      description,
      price,
      category,
      subcategory,
      stock,
      brand,
      discount,
      isFeatured,
      isActive,
    } = body;

    if (!name || String(name).trim().length < 3) {
      return res
        .status(400)
        .json({ message: "Name is required and must be at least 3 characters" });
    }
    if (!description || String(description).trim().length < 10) {
      return res
        .status(400)
        .json({ message: "Description is required and must be at least 10 characters" });
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
        return res
          .status(400)
          .json({ message: "Subcategory invalid or does not belong to category" });
      }
    }

    // ===== images =====
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

    // ===== i18n поля =====
    const name_i18n = await buildLocalizedField(String(name).trim());
    const description_i18n = await buildLocalizedField(String(description).trim());

    const product = new Product({
      name: name_i18n,
      description: description_i18n,
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

    // Отдадим локализованно под запрос
    const want = pickLangFromReq(req);
    const data = product.toObject();
    data.name_i18n = data.name;
    data.description_i18n = data.description;
    data.name = pickLocalized(data.name, want);
    data.description = pickLocalized(data.description, want);

    res.status(201).json({ message: "Product created", data });
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
      // искать по всем языкам
      query.$or = [
        { "name.ru": regex },
        { "name.en": regex },
        { "name.fi": regex },
        { "description.ru": regex },
        { "description.en": regex },
        { "description.fi": regex },
      ];
    }
    if (category) query.category = category;
    if (subcategory) query.subcategory = subcategory;

    const skip = (page - 1) * limit;
    const totalProducts = await Product.countDocuments(query);

    const items = await Product.find(query)
      .populate("category")
      .populate("subcategory")
      .select("-__v")
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit));

    const want = pickLangFromReq(req);
    const products = items.map((doc) => {
      const o = doc.toObject();
      o.name_i18n = o.name;
      o.description_i18n = o.description;
      o.name = pickLocalized(o.name, want);
      o.description = pickLocalized(o.description, want);
      return o;
    });

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

    const want = pickLangFromReq(req);
    const data = product.toObject();
    data.name_i18n = data.name;
    data.description_i18n = data.description;
    data.name = pickLocalized(data.name, want);
    data.description = pickLocalized(data.description, want);

    res.status(200).json({ message: "Product fetched", data });
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
    const want = pickLangFromReq(req);
    const items = await Product.find({ category: categoryId });
    const products = items.map((doc) => {
      const o = doc.toObject();
      o.name_i18n = o.name;
      o.description_i18n = o.description;
      o.name = pickLocalized(o.name, want);
      o.description = pickLocalized(o.description, want);
      return o;
    });
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
    const want = pickLangFromReq(req);
    const items = await Product.find({ category: categoryId, subcategory: subcategoryId });
    const products = items.map((doc) => {
      const o = doc.toObject();
      o.name_i18n = o.name;
      o.description_i18n = o.description;
      o.name = pickLocalized(o.name, want);
      o.description = pickLocalized(o.description, want);
      return o;
    });
    res.json({ message: "Products by category+subcategory", data: products });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================================================
 * UPDATE
 * =======================================================*/
const updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const files = req.files || [];
    const body = req.body || {};

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
    } = body;

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    // валидация обязательных только если они присланы
    if (name && String(name).trim().length < 3) {
      return res.status(400).json({ message: "Name must be at least 3 characters" });
    }
    if (description && String(description).trim().length < 10) {
      return res.status(400).json({ message: "Description must be at least 10 characters" });
    }

    if (price !== undefined) {
      const parsedPrice = Number(price);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        return res.status(400).json({ message: "Price must be a non-negative number" });
      }
      product.price = parsedPrice;
    }

    if (stock !== undefined) {
      const parsedStock = Number.isInteger(Number(stock)) ? Number(stock) : NaN;
      if (!Number.isFinite(parsedStock) || parsedStock < 0) {
        return res.status(400).json({ message: "Stock must be a non-negative integer" });
      }
      product.stock = parsedStock;
    }

    if (category) {
      if (!mongoose.Types.ObjectId.isValid(category)) {
        return res.status(400).json({ message: "Invalid category ID" });
      }
      product.category = category;
    }

    const normSub = (val) => {
      if (val == null) return undefined;
      if (typeof val !== "string") return val;
      const t = val.trim().toLowerCase();
      if (!t || t === "undefined" || t === "null") return undefined;
      return val;
    };
    const normalizedSubcategory = normSub(subcategory);
    if (subcategory !== undefined) {
      if (normalizedSubcategory && !mongoose.Types.ObjectId.isValid(normalizedSubcategory)) {
        return res.status(400).json({ message: "Invalid subcategory ID" });
      }
      product.subcategory = normalizedSubcategory || undefined;
    }

    if (typeof brand !== "undefined") product.brand = brand ? String(brand).trim() : undefined;
    if (typeof discount !== "undefined") product.discount = Number(discount);
    if (typeof isFeatured !== "undefined")
      product.isFeatured = isFeatured === "true" || isFeatured === true;
    if (typeof isActive !== "undefined")
      product.isActive = !(isActive === "false" || isActive === false);

    // ----- локализация -----
    if (name) {
      product.name = await updateLocalizedField(product.name, String(name).trim());
    }
    if (description) {
      product.description = await updateLocalizedField(
        product.description,
        String(description).trim()
      );
    }

    // ----- изображения -----
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

    await product.save();

    const want = pickLangFromReq(req);
    const data = product.toObject();
    data.name_i18n = data.name;
    data.description_i18n = data.description;
    data.name = pickLocalized(data.name, want);
    data.description = pickLocalized(data.description, want);

    return res.status(200).json({ message: "Product updated", data });
  } catch (error) {
    console.error("Error in updateProduct:", error, { headers: req.headers });
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

/* =========================================================
 * SEARCH
 * =======================================================*/
const searchProducts = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim() === "") {
      return res.status(400).json({ message: 'Query parameter "q" is required' });
    }
    const regex = new RegExp(q, "i");
    const items = await Product.find({
      $or: [
        { "name.ru": regex },
        { "name.en": regex },
        { "name.fi": regex },
        { "description.ru": regex },
        { "description.en": regex },
        { "description.fi": regex },
      ],
    })
      .limit(30)
      .populate("category")
      .populate("subcategory")
      .select("-__v")
      .sort({ createdAt: -1 });

    const want = pickLangFromReq(req);
    const products = items.map((doc) => {
      const o = doc.toObject();
      o.name_i18n = o.name;
      o.description_i18n = o.description;
      o.name = pickLocalized(o.name, want);
      o.description = pickLocalized(o.description, want);
      return o;
    });

    res.status(200).json({ message: "Search completed", data: products });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ message: "Server error during search" });
  }
};

/* =========================================================
 * DELETE & IMAGES (без изменений логики)
 * =======================================================*/
const deleteProduct = async (req, res) => { /* ... без изменений ... */ };
const deleteProductImage = async (req, res) => { /* ... без изменений ... */ };
const updateProductImage = async (req, res) => { /* ... без изменений ... */ };

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
