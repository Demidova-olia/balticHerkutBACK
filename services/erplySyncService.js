// services/erplySyncService.js
const Product = require("../models/productModel");
const Category = require("../models/categoryModel");
const { buildLocalizedField } = require("../utils/translator");
const { fetchStockByProductId } = require("../utils/erplyClient");

const DEFAULT_CATEGORY_ID = process.env.ERPLY_DEFAULT_CATEGORY_ID || null;

// 4–14 цифр
const BARCODE_RE = /^\d{4,14}$/;

function normalizeBarcode(raw) {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  if (!BARCODE_RE.test(s)) return undefined;
  return s;
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

// нормализуем остаток, если вдруг Erply вернёт какие-то поля в getProducts
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

// маппим только нужные поля из ответа getProducts
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

  // сначала используем штрих-код, который посчитали в erplyClient
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

  // из getProducts обычно стока нет, но на всякий случай оставим
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
  const minimal = mapErplyMinimal(erplyProduct);
  const {
    erplyId,
    erplySKU,
    barcode,
    nameStr,
    descStr,
    price,
    brand,
  } = minimal;

  // отдельным запросом тянем реальный сток из getProductStock
  let stock = minimal.stock;
  if (erplyId) {
    const stockFromErp = await fetchStockByProductId(erplyId);
    if (Number.isFinite(stockFromErp)) {
      stock = stockFromErp;
    }
  }

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
      stock,
      barcode: barcode || undefined,

      category: categoryId,
      subcategory: undefined,
      images: [],
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
  existing.stock = stock;

  if (barcode) existing.barcode = barcode;
  if (brand !== undefined) existing.brand = brand || undefined;

  existing.category = categoryId;
  existing.needsCategorization = true;

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

// синк остатка и цены по erplyId (кнопка "Sync" в админке)
async function syncPriceStockByErplyId(erplyId) {
  const { fetchProductById } = require("../utils/erplyClient");

  const remote = await fetchProductById(erplyId);
  if (!remote) return null;

  const minimal = mapErplyMinimal(remote);
  let stockFromErp = minimal.stock;
  const priceFromErp = minimal.price;

  // по возможности берём сток из getProductStock
  const stockFromStockApi = await fetchStockByProductId(erplyId);
  if (Number.isFinite(stockFromStockApi)) {
    stockFromErp = stockFromStockApi;
  }

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
