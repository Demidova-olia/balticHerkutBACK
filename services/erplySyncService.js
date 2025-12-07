// services/erplySyncService.js
const Product = require("../models/productModel");
const Category = require("../models/categoryModel");
const { buildLocalizedField } = require("../utils/translator");

const DEFAULT_CATEGORY_ID = process.env.ERPLY_DEFAULT_CATEGORY_ID || null;

// 4–14 цифр
const BARCODE_RE = /^\d{4,14}$/;

/**
 * Нормализуем штрих-код:
 *  - оставляем только цифры
 *  - проверяем длину 4–14
 */
function normalizeBarcode(raw) {
  if (raw == null) return undefined;
  const digits = String(raw).replace(/\D+/g, "");
  if (!digits) return undefined;
  return BARCODE_RE.test(digits) ? digits : undefined;
}

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

// нормализуем остаток: берём Available/freeQuantity, если < 0 — делаем 0
function extractAvailableStock(erply) {
  const raw =
    erply?.freeQuantity ??
    erply?.available ??
    erply?.Available ??
    erply?.amountInStock ??
    erply?.totalInStock ??
    erply?.neto ??
    erply?.quantity ??
    erply?.stock ??
    erply?.inStock ??
    0;

  const n = Number(raw) || 0;
  return n < 0 ? 0 : n;
}

// маппим только нужные поля из ответа Erply
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

  // В первую очередь используем штрихкод,
  // который уже вычислен в erplyClient (__extractedBarcode),
  // а дальше — поля из самого продукта.
  const barcodeRaw =
    erplyProduct.__extractedBarcode ??
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

  // ВАЖНО: берём доступный остаток и не допускаем минуса
  const stock = extractAvailableStock(erplyProduct);

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

// создаём/обновляем товар по данным из Erply
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

  let existing = null;

  if (barcode) {
    existing = await Product.findOne({ barcode });
  }
  if (!existing && erplyId) {
    existing = await Product.findOne({ erplyId });
  }

  // CREATE
  if (!existing) {
    const doc = await Product.create({
      name: name_i18n,
      description: description_i18n,
      price,
      stock, // уже обрезано до 0, если было отрицательное
      barcode: barcode || undefined,

      category: categoryId,
      subcategory: undefined,
      images: [], // картинки из Erply не тянем
      brand: brand || undefined,
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

  // UPDATE
  existing.name = name_i18n;
  existing.description = description_i18n;
  existing.price = price;
  existing.stock = stock; // здесь тоже уже нет отрицательных значений

  if (barcode) existing.barcode = barcode;
  if (brand !== undefined) existing.brand = brand || undefined;

  existing.category = categoryId;
  existing.needsCategorization = true;

  // свои картинки не трогаем
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

// синк остатка И ЦЕНЫ по erplyId (кнопка на странице продукта)
async function syncPriceStockByErplyId(erplyId) {
  const { fetchProductById } = require("../utils/erplyClient");
  const remote = await fetchProductById(erplyId);
  if (!remote) return null;

  const minimal = mapErplyMinimal(remote);
  const stockFromErp = minimal.stock;
  const priceFromErp = minimal.price;

  const doc = await Product.findOne({ erplyId: String(erplyId) });
  if (!doc) return null;

  let changedStock = false;
  let changedPrice = false;

  if (Number.isFinite(stockFromErp) && stockFromErp !== doc.stock) {
    doc.stock = stockFromErp;
    changedStock = true;
  }

  if (Number.isFinite(priceFromErp) && priceFromErp !== doc.price) {
    doc.price = priceFromErp;
    changedPrice = true;
  }

  if (changedStock || changedPrice) {
    doc.erplySyncedAt = new Date();
    await doc.save();
  }

  return {
    _id: doc._id,
    changedStock,
    changedPrice,
    stock: doc.stock,
    price: doc.price,
  };
}

module.exports = { upsertFromErply, syncPriceStockByErplyId, mapErplyMinimal };
