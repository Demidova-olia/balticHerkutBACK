// services/erplySyncService.js
const Product = require("../models/productModel");
const Category = require("../models/categoryModel");
const { downloadImageToBuffer } = require("../utils/downloadImageToBuffer");
const { buildLocalizedField } = require("../utils/translator");
const cloudinary = require("cloudinary").v2;

const DEFAULT_CATEGORY_ID = process.env.ERPLY_DEFAULT_CATEGORY_ID || null;

/* ============================================================================
 * Helpers: barcode / category / images
 * ========================================================================== */

// 4–14 цифр
const BARCODE_RE = /^\d{4,14}$/;

function normalizeBarcode(raw) {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  if (!BARCODE_RE.test(s)) return undefined;
  return s;
}

/**
 * Получаем id категории:
 * 1) если выставлен ERPLY_DEFAULT_CATEGORY_ID → используем его
 * 2) иначе ищем/создаём категорию со slug "imported"
 */
async function ensureDefaultCategoryId() {
  if (DEFAULT_CATEGORY_ID) return DEFAULT_CATEGORY_ID;

  let cat = await Category.findOne({ slug: "imported" });
  if (cat) return String(cat._id);

  cat = await Category.create({
    name: {
      en: "Imported",
      ru: "Импортировано",
      fi: "Tuotu",
    },
    slug: "imported",
    createdFromErply: true,
  });

  return String(cat._id);
}

async function uploadRemoteImagesToCloudinary(images) {
  const out = [];
  for (const img of images || []) {
    try {
      const sourceUrl = img.sourceUrl || img.url;
      if (!sourceUrl) continue;

      const buffer = await downloadImageToBuffer(sourceUrl);
      const uploaded = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "products", resource_type: "image" },
          (err, result) => (err ? reject(err) : resolve(result))
        );
        stream.end(buffer);
      });

      out.push({
        url: uploaded.secure_url || uploaded.url,
        public_id: uploaded.public_id,
        sourceUrl,
      });
    } catch (e) {
      console.warn("[erplySync] image upload failed:", e?.message || e);
    }
  }
  return out;
}

/**
 * Собираем возможные ссылки на картинки из Erply-объекта
 */
function extractImageCandidates(erplyProduct) {
  const urls = new Set();

  [
    erplyProduct.pictureURL,
    erplyProduct.pictureUrl,
    erplyProduct.imageURL,
    erplyProduct.imageUrl,
    erplyProduct.image,
    erplyProduct.largeImage,
    erplyProduct.smallImage,
  ]
    .filter(Boolean)
    .map(String)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s))
    .forEach((u) => urls.add(u));

  return Array.from(urls).map((u) => ({ sourceUrl: u }));
}

/**
 * Вытаскиваем нужные поля из Erply-ответа:
 *  - name / description
 *  - price
 *  - stock
 *  - barcode
 *  - erplyId / erplySKU
 */
function mapErplyMinimal(erplyProduct) {
  if (!erplyProduct || typeof erplyProduct !== "object") {
    throw new Error("Invalid Erply product payload");
  }

  const erplyId =
    erplyProduct.productID ??
    erplyProduct.productId ??
    erplyProduct.id ??
    null;

  const erplySKU =
    erplyProduct.code2 ??
    erplyProduct.code ??
    erplyProduct.sku ??
    null;

  const barcodeRaw =
    erplyProduct.EAN ??
    erplyProduct.ean ??
    erplyProduct.eanCode ??
    erplyProduct.barcode ??
    erplyProduct.code2 ??
    erplyProduct.code ??
    null;

  const barcode = normalizeBarcode(barcodeRaw);

  const nameStr =
    erplyProduct.name ||
    erplyProduct.productName ||
    erplyProduct.itemName ||
    erplyProduct.fullName ||
    "Imported product";

  const descStr =
    erplyProduct.longdesc ||
    erplyProduct.longDescription ||
    erplyProduct.description ||
    "";

  const price =
    Number(
      erplyProduct.priceWithVat ??
        erplyProduct.priceWithVAT ??
        erplyProduct.price ??
        erplyProduct.priceOriginal ??
        erplyProduct.basePrice
    ) || 0;

  const stock =
    Number(
      erplyProduct.amountInStock ??
        erplyProduct.totalInStock ??
        erplyProduct.neto ??
        erplyProduct.quantity ??
        erplyProduct.freeQuantity
    ) || 0;

  const brand =
    erplyProduct.brandName ||
    erplyProduct.brand ||
    undefined;

  return {
    erplyId: erplyId ? String(erplyId) : undefined,
    erplySKU: erplySKU || undefined,
    barcode,
    nameStr: String(nameStr).trim(),
    descStr: String(descStr || "").trim(),
    price,
    stock,
    brand,
  };
}

/* ============================================================================
 * UPSERT FROM ERPLY
 * ========================================================================== */

/**
 * upsertFromErply(erplyProduct)
 *
 * Создаёт или обновляет товар:
 *  - ищет СНАЧАЛА по barcode, потом по erplyId
 *  - пишет только name/description/price/stock/barcode/brand + служебные поля
 *  - категория всегда одна (Imported / из env)
 */
async function upsertFromErply(erplyProduct) {
  const {
    erplyId,
    erplySKU,
    barcode,
    nameStr,
    descStr,
    price,
    stock,
    brand,
  } = mapErplyMinimal(erplyProduct);

  const categoryId = await ensureDefaultCategoryId();

  const name_i18n = await buildLocalizedField(nameStr);
  const description_i18n = await buildLocalizedField(descStr);

  const imageCandidates = extractImageCandidates(erplyProduct);
  const cloudImages = await uploadRemoteImagesToCloudinary(imageCandidates);

  // --- поиск существующего товара ---
  let existing = null;

  if (barcode) {
    existing = await Product.findOne({ barcode });
  }
  if (!existing && erplyId) {
    existing = await Product.findOne({ erplyId });
  }

  // ---------- CREATE ----------
  if (!existing) {
    const doc = await Product.create({
      name: name_i18n,
      description: description_i18n,
      price,
      stock,
      barcode: barcode || undefined,
      category: categoryId,
      subcategory: undefined,
      images: cloudImages,
      brand: brand || undefined,
      discount: undefined,
      isFeatured: false,
      isActive: true,
      averageRating: 0,
      needsCategorization: true,

      erplyId: erplyId || undefined,
      erplySKU: erplySKU || undefined,
      erpSource: "erply",
      erplyProductGroupId:
        erplyProduct.productGroupID ??
        erplyProduct.groupID ??
        erplyProduct.productGroupId ??
        erplyProduct.groupId ??
        undefined,
      erplyProductGroupName:
        erplyProduct.productGroupName ??
        erplyProduct.groupName ??
        erplyProduct.productGroup ??
        undefined,
      erplySyncedAt: new Date(),
    });

    return doc;
  }

  // ---------- UPDATE ----------
  existing.name = name_i18n;
  existing.description = description_i18n;
  existing.price = price;
  existing.stock = stock;

  if (barcode) existing.barcode = barcode;
  if (brand !== undefined) existing.brand = brand || undefined;
  existing.category = categoryId;
  existing.needsCategorization = true;

  if (cloudImages.length) {
    existing.images = cloudImages;
  }

  if (erplyId) existing.erplyId = erplyId;
  if (erplySKU) existing.erplySKU = erplySKU;

  existing.erpSource = "erply";
  existing.erplyProductGroupId =
    erplyProduct.productGroupID ??
    erplyProduct.groupID ??
    erplyProduct.productGroupId ??
    erplyProduct.groupId ??
    existing.erplyProductGroupId;

  existing.erplyProductGroupName =
    erplyProduct.productGroupName ??
    erplyProduct.groupName ??
    erplyProduct.productGroup ??
    existing.erplyProductGroupName;

  existing.erplySyncedAt = new Date();

  await existing.save();
  return existing;
}

/* ============================================================================
 * LIGHT SYNC (price + stock)
 * ========================================================================== */

async function syncPriceStockByErplyId(erplyId) {
  const { fetchProductById } = require("../utils/erplyClient");
  const remote = await fetchProductById(erplyId);
  if (!remote) return null;

  const priceFromErp =
    Number(
      remote.priceWithVat ??
        remote.priceWithVAT ??
        remote.price ??
        remote.priceOriginal ??
        remote.basePrice
    ) || 0;

  const stockFromErp =
    Number(
      remote.amountInStock ??
        remote.totalInStock ??
        remote.neto ??
        remote.quantity ??
        remote.freeQuantity
    ) || 0;

  const doc = await Product.findOne({ erplyId: String(erplyId) });
  if (!doc) return null;

  let changed = false;

  if (Number.isFinite(priceFromErp) && priceFromErp !== doc.price) {
    doc.price = priceFromErp;
    changed = true;
  }
  if (Number.isFinite(stockFromErp) && stockFromErp !== doc.stock) {
    doc.stock = stockFromErp;
    changed = true;
  }

  if (changed) {
    doc.erplySyncedAt = new Date();
    await doc.save();
  }

  return { _id: doc._id, changed, price: doc.price, stock: doc.stock };
}

module.exports = { upsertFromErply, syncPriceStockByErplyId, mapErplyMinimal, };
