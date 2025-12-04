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

// === barcode: 4–14 digits ===
const BARCODE_RE = /^\d{4,14}$/;

function normalizeBarcode(raw) {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  if (!BARCODE_RE.test(s)) return null;
  return s;
}

/** ===== Cloudinary helpers ===== */
function isCloudinaryUrl(url) {
  return typeof url === "string" && /res\.cloudinary\.com\/.+\/image\/upload\//.test(url);
}

function extractPublicIdFromUrl(url) {
  if (!isCloudinaryUrl(url)) return null;
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/");
    const uploadIdx = parts.indexOf("upload");
    if (uploadIdx === -1) return null;
    const tail = parts.slice(uploadIdx + 1);
    const noVersion = tail[0] && /^v\d+$/.test(tail[0]) ? tail.slice(1) : tail;
    if (!noVersion.length) return null;
    const last = noVersion[noVersion.length - 1];
    const withoutExt = last.replace(/\.[a-zA-Z0-9]+$/, "");
    const publicIdParts = noVersion.slice(0, -1).concat(withoutExt);
    return publicIdParts.join("/");
  } catch {
    return null;
  }
}

function collectPublicIdsFromImages(images) {
  const ids = [];
  for (const img of Array.isArray(images) ? images : []) {
    if (!img) continue;
    if (typeof img === "string") {
      const pid = extractPublicIdFromUrl(img);
      if (pid) ids.push(pid);
      continue;
    }
    if (img.public_id && typeof img.public_id === "string") {
      ids.push(img.public_id);
    } else if (img.url) {
      const pid = extractPublicIdFromUrl(img.url);
      if (pid) ids.push(pid);
    }
  }
  return ids.filter((pid) => pid && pid !== "default_local_image");
}

async function deleteCloudinaryResources(publicIds) {
  if (!publicIds.length) return { deleted: {} };
  return await cloudinary.api.delete_resources(publicIds, { resource_type: "image" });
}

/* =========================================================
 * CREATE
 * =======================================================*/
const createProduct = async (req, res) => {
  try {
    const body = req.body || {};
    const lang = pickLangFromReq(req) || "en";

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
      barcode,
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
      subcategoryDoc = await Subcategory.findOne({
        _id: normalizedSubcategory,
        parent: category,
      });
      if (!subcategoryDoc) {
        return res
          .status(400)
          .json({ message: "Subcategory invalid or does not belong to category" });
      }
    }

    // ===== barcode =====
    const bc = normalizeBarcode(barcode);
    if (bc === null) {
      return res.status(400).json({ message: "Invalid barcode: expected 4–14 digits" });
    }
    if (bc) {
      const exists = await Product.exists({ barcode: bc });
      if (exists) return res.status(409).json({ message: "Barcode already exists" });
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
      images = bodyImages.map((url) => ({ url, public_id: "default_local_image" }));
    }

    // Локализованные поля: язык определяется по текущему UI (pickLangFromReq)
    const name_i18n = await buildLocalizedField(String(name).trim(), lang);
    const description_i18n = await buildLocalizedField(String(description).trim(), lang);

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
      barcode: bc,
      // erpSource по умолчанию "manual" – это и нужно
    });

    await product.save();

    const want = pickLangFromReq(req);
    const data = product.toObject();
    data.name_i18n = data.name;
    data.description_i18n = data.description;
    data.name = pickLocalized(data.name, want);
    data.description = pickLocalized(data.description, want);

    res.status(201).json({ message: "Product created", data });
  } catch (err) {
    if (err && err.code === 11000 && err.keyPattern && err.keyPattern.barcode) {
      return res.status(409).json({ message: "Barcode already exists" });
    }
    console.error("Error in createProduct:", err);
    res.status(500).json({ message: "Failed to create product" });
  }
};

/* =========================================================
 * LIST
 * =======================================================*/
const getProducts = async (req, res) => {
  try {
    const {
      search,
      category,
      subcategory,
      page = 1,
      limit = 10,
      includeUncategorized,
    } = req.query;

    const query = {};

    if (search) {
      const s = String(search).trim();
      const regex = new RegExp(s, "i");
      const or = [
        { "name.ru": regex },
        { "name.en": regex },
        { "name.fi": regex },
        { "description.ru": regex },
        { "description.en": regex },
        { "description.fi": regex },
      ];
      if (BARCODE_RE.test(s)) {
        or.push({ barcode: s });
      }
      query.$or = or;
    }

    if (category) query.category = category;
    if (subcategory) query.subcategory = subcategory;

    if (!includeUncategorized) {
      query.needsCategorization = { $ne: true };
    }

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
    const lang = pickLangFromReq(req) || "en";

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
      barcode,
    } = body;

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

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
      product.needsCategorization = false;
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

    if (typeof brand !== "undefined") {
      product.brand = brand ? String(brand).trim() : undefined;
    }
    if (typeof discount !== "undefined") {
      product.discount = Number(discount);
    }
    if (typeof isFeatured !== "undefined") {
      product.isFeatured = isFeatured === "true" || isFeatured === true;
    }
    if (typeof isActive !== "undefined") {
      product.isActive = !(isActive === "false" || isActive === false);
    }

    // i18n: обновляем с учётом текущего языка UI
    if (name) {
      product.name = await updateLocalizedField(
        product.name,
        String(name).trim(),
        lang
      );
    }
    if (description) {
      product.description = await updateLocalizedField(
        product.description,
        String(description).trim(),
        lang
      );
    }

    // barcode set/change/clear
    if (barcode !== undefined) {
      const bc = normalizeBarcode(barcode);
      if (bc === null) {
        return res.status(400).json({ message: "Invalid barcode: expected 4–14 digits" });
      }
      if (!bc) {
        product.barcode = undefined;
      } else {
        const duplicate = await Product.findOne({
          _id: { $ne: product._id },
          barcode: bc,
        }).lean();
        if (duplicate) {
          return res.status(409).json({ message: "Barcode already exists" });
        }
        product.barcode = bc;
      }
    }

    // images
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
            else if (parsed && parsed.url && parsed.public_id) existingImagesParsed = [parsed];
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
      newImages = uploadResults.map((r) => ({
        url: r.secure_url || r.url,
        public_id: r.public_id,
      }));
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
    if (error && error.code === 11000 && error.keyPattern && error.keyPattern.barcode) {
      return res.status(409).json({ message: "Barcode already exists" });
    }
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

    const s = String(q).trim();
    const regex = new RegExp(s, "i");
    const or = [
      { "name.ru": regex },
      { "name.en": regex },
      { "name.fi": regex },
      { "description.ru": regex },
      { "description.en": regex },
      { "description.fi": regex },
    ];
    if (BARCODE_RE.test(s)) or.push({ barcode: s });

    const items = await Product.find({ $or: or })
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
 * DELETE PRODUCT
 * =======================================================*/
const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const publicIds = collectPublicIdsFromImages(product.images);
    if (publicIds.length) {
      try {
        const result = await deleteCloudinaryResources(publicIds);
        console.log("[deleteProduct] cloudinary delete_resources:", result);
      } catch (e) {
        console.warn("[deleteProduct] cloudinary delete_resources failed:", e?.message || e);
      }
    }

    await Product.findByIdAndDelete(id);

    return res.status(200).json({ message: "Product deleted", data: { _id: id } });
  } catch (error) {
    console.error("Error in deleteProduct:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
 * DELETE SINGLE IMAGE
 * =======================================================*/
const deleteProductImage = async (req, res) => {
  try {
    const productId = String(req.params.productId || req.params.id || "").trim();
    const rawPublicId = decodeURIComponent(String(req.params.publicId || "").trim());

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }
    if (!rawPublicId) {
      return res.status(400).json({ message: "publicId is required" });
    }

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    try {
      if (rawPublicId !== "default_local_image") {
        const resDel = await cloudinary.uploader.destroy(rawPublicId);
        console.log("[deleteProductImage] cloudinary.destroy:", rawPublicId, resDel);
      }
    } catch (e) {
      console.warn("[deleteProductImage] cloudinary destroy failed:", rawPublicId, e?.message);
    }

    product.images = (product.images || []).filter((img) => {
      if (!img) return false;
      if (typeof img === "string") {
        const fromUrl = extractPublicIdFromUrl(img);
        return fromUrl !== rawPublicId;
      }
      return img.public_id !== rawPublicId;
    });

    await product.save();

    return res.status(200).json({
      message: "Image deleted",
      data: { _id: productId, public_id: rawPublicId },
    });
  } catch (error) {
    console.error("Error in deleteProductImage:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
 * UPDATE SINGLE IMAGE
 * =======================================================*/
const updateProductImage = async (req, res) => {
  try {
    const productId = String(req.params.productId || req.params.id || "").trim();
    const oldPid = decodeURIComponent(String(req.params.publicId || "").trim());
    const file = req.file;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }
    if (!file) {
      return res.status(400).json({ message: "Image file is required" });
    }

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    const uploaded = await uploadToCloudinary(file.buffer, file.originalname);
    const newUrl = uploaded.secure_url || uploaded.url;
    const newPid = uploaded.public_id;

    if (oldPid && oldPid !== "default_local_image") {
      try {
        const resDel = await cloudinary.uploader.destroy(oldPid);
        console.log("[updateProductImage] cloudinary.destroy:", oldPid, resDel);
      } catch (e) {
        console.warn("[updateProductImage] cloudinary destroy failed:", oldPid, e?.message);
      }
    }

    product.images = (product.images || []).map((img) => {
      if (typeof img === "string") {
        const fromUrl = extractPublicIdFromUrl(img);
        return fromUrl === oldPid ? { url: newUrl, public_id: newPid } : img;
      }
      return img.public_id === oldPid ? { url: newUrl, public_id: newPid } : img;
    });

    await product.save();

    return res.status(200).json({
      message: "Image updated",
      data: { _id: productId, public_id: newPid, url: newUrl },
    });
  } catch (error) {
    console.error("Error in updateProductImage:", error);
    return res.status(500).json({ message: "Server error" });
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
