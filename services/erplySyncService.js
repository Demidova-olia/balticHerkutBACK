// services/erplySyncService.js
const Product = require("../models/productModel");
const Category = require("../models/categoryModel");
const { mapErplyToProductFields } = require("../utils/erplyMapper");
const { downloadImageToBuffer } = require("../utils/downloadImageToBuffer");
const cloudinary = require("cloudinary").v2;

/**
 * Если хочешь жёстко указать категорию для всех ERPLY-товаров —
 * просто положи её _id в .env как ERPLY_DEFAULT_CATEGORY_ID
 */
const DEFAULT_CATEGORY_ID = process.env.ERPLY_DEFAULT_CATEGORY_ID || null;

if (!DEFAULT_CATEGORY_ID) {
  console.warn(
    "[erplySyncService] ERPLY_DEFAULT_CATEGORY_ID is not set — " +
      "will try to use category with slug 'imported'."
  );
}

/* ============================================================================
 * Cloudinary helpers
 * ========================================================================== */

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
      console.warn("[erplySyncService] uploadRemoteImagesToCloudinary failed:", e?.message);
    }
  }
  return out;
}

/* ============================================================================
 * Category resolver: ВСЕ ERPLY-товары → ОДНА категория
 * ========================================================================== */

let importedCategoryIdCache = null;

async function getImportedCategoryId() {
  // 1) Явно заданная категория из .env
  if (DEFAULT_CATEGORY_ID) return DEFAULT_CATEGORY_ID;

  // 2) Категория со slug: "imported"
  if (!importedCategoryIdCache) {
    const cat = await Category.findOne({ slug: "imported" }).lean();
    if (!cat) {
      throw new Error(
        "erplySyncService: category with slug 'imported' not found " +
          "and ERPLY_DEFAULT_CATEGORY_ID is not set"
      );
    }
    importedCategoryIdCache = String(cat._id);
  }
  return importedCategoryIdCache;
}

/**
 * Сейчас erplyProduct нам почти не нужен — все ERPLY-товары
 * летят в одну категорию.
 */
async function resolveCategoryFromErply(/* erplyProduct */) {
  const categoryId = await getImportedCategoryId();
  return {
    categoryId,
    needsCategorization: false,
    groupId: null,
    groupName: null,
  };
}

/* ============================================================================
 * UPSERT from ERPLY
 * ========================================================================== */

async function upsertFromErply(erplyProduct) {
  // mapErplyToProductFields должен вытащить:
  // - barcode
  // - name
  // - price
  // - stock
  // - + опционально description, brand, images, erplyId, erplySKU
  const { mapped, hash } = mapErplyToProductFields(erplyProduct);

  const { categoryId, needsCategorization, groupId, groupName } =
    await resolveCategoryFromErply(erplyProduct);

  if (!categoryId) {
    console.error(
      "[upsertFromErply] Cannot resolve category for Erply product",
      erplyProduct?.productID || erplyProduct?.id
    );
    throw new Error("Failed to resolve category for Erply product");
  }

  mapped.category = categoryId;
  mapped.needsCategorization = !!needsCategorization;
  if (groupId != null) mapped.erplyProductGroupId = groupId;
  if (groupName) mapped.erplyProductGroupName = groupName;

  // Ищем существующий товар по erplyId или по штрих-коду
  const byErply = mapped.erplyId
    ? await Product.findOne({ erplyId: String(mapped.erplyId) })
    : null;

  const byBarcode = mapped.barcode
    ? await Product.findOne({ barcode: mapped.barcode })
    : null;

  const existing = byErply || byBarcode;

  // Загружаем картинки, если есть
  const cloudImgs = await uploadRemoteImagesToCloudinary(mapped.images || []);
  if (cloudImgs.length) mapped.images = cloudImgs;

  /* ---------- СОЗДАНИЕ НОВОГО ПРОДУКТА ---------- */
  if (!existing) {
    const created = await Product.create({
      ...mapped,
      erplyHash: hash,
      erplySyncedAt: new Date(),
      erpSource: "erply",
    });
    return created;
  }

  /* ---------- ОБНОВЛЕНИЕ СУЩЕСТВУЮЩЕГО ПРОДУКТА ---------- */

  // 1) Всегда приводим цену и остаток к данным из ERPLY
  if (Number.isFinite(Number(mapped.price))) {
    existing.price = Number(mapped.price);
  }
  if (Number.isFinite(Number(mapped.stock))) {
    existing.stock = Number(mapped.stock);
  }

  // 2) Всегда обновляем базовые поля: название и штрих-код
  if (mapped.name) existing.name = mapped.name;
  if (mapped.barcode) existing.barcode = mapped.barcode;

  // 3) Описание / бренд / картинки — берём из ERPLY, если пришли
  if (mapped.description) existing.description = mapped.description;
  if (typeof mapped.brand !== "undefined") existing.brand = mapped.brand;
  if (cloudImgs.length) existing.images = cloudImgs;

  // 4) Служебные поля ERPLY
  if (mapped.erplyId) existing.erplyId = String(mapped.erplyId);
  if (mapped.erplySKU) existing.erplySKU = mapped.erplySKU;

  if (mapped.category) existing.category = mapped.category;
  existing.needsCategorization = !!mapped.needsCategorization;

  if (groupId != null) existing.erplyProductGroupId = groupId;
  if (groupName) existing.erplyProductGroupName = groupName;

  existing.erplyHash = hash;
  existing.erpSource = "erply";
  existing.erplySyncedAt = new Date();

  await existing.save();
  return existing;
}

/* ============================================================================
 * Лёгкая синхронизация только цены и остатка
 * ========================================================================== */

async function syncPriceStockByErplyId(erplyId) {
  const { fetchProductById } = require("../utils/erplyClient");
  const remote = await fetchProductById(erplyId);
  if (!remote) return null;

  const priceFromErp = Number(
    remote.priceWithVat ?? remote.priceWithVAT ?? remote.price ?? 0
  );

  const stockFromErp = Number(
    remote.amountInStock ?? remote.totalInStock ?? remote.freeQuantity ?? 0
  );

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

module.exports = { upsertFromErply, syncPriceStockByErplyId };
