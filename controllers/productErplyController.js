// controllers/productErplyController.js
const mongoose = require("mongoose");
const Product = require("../models/productModel");

const { fetchProductById, fetchProductByBarcode } = require("../utils/erplyClient");
const {
  upsertFromErply,
  syncPriceStockByErplyId,
  mapErplyMinimal,
} = require("../services/erplySyncService");
const {
  pickLangFromReq,
  pickLocalized,
  buildLocalizedField,
} = require("../utils/translator");

// 4–14 цифр
const BARCODE_RE = /^\d{4,14}$/;

// нормализация штрих-кода: оставляем только цифры
function normalizeBarcode(raw) {
  if (raw == null) return undefined;
  const digits = String(raw).replace(/\D+/g, "");
  if (!digits) return undefined;
  return BARCODE_RE.test(digits) ? digits : null;
}

/* =========================================================
 * DEBUG: RAW ERPLY — по ID
 * =======================================================*/
const debugErplyById = async (req, res) => {
  try {
    const { erplyId } = req.params;
    if (!erplyId) return res.status(400).json({ message: "erplyId is required" });

    const remote = await fetchProductById(erplyId);
    if (!remote) {
      return res.status(404).json({ message: "Erply product not found" });
    }

    return res.status(200).json({ erplyId, remote });
  } catch (e) {
    console.error("debugErplyById:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
 * DEBUG: RAW ERPLY — по BARCODE
 * =======================================================*/
const debugErplyByBarcode = async (req, res) => {
  try {
    const { barcode } = req.params;
    if (!barcode) return res.status(400).json({ message: "barcode is required" });

    const normalized = normalizeBarcode(barcode);
    if (!normalized) {
      return res.status(400).json({ message: "Invalid barcode" });
    }

    const remote = await fetchProductByBarcode(normalized);
    if (!remote) {
      return res.status(404).json({ message: "Erply product not found" });
    }

    return res.status(200).json({ barcode: normalized, remote });
  } catch (e) {
    console.error("debugErplyByBarcode:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
 * IMPORT BY ERPLY ID
 * =======================================================*/
const importFromErplyById = async (req, res) => {
  try {
    const { erplyId } = req.params;
    if (!erplyId) return res.status(400).json({ message: "erplyId is required" });

    const remote = await fetchProductById(erplyId);
    if (!remote) return res.status(404).json({ message: "Erply product not found" });

    let doc;
    try {
      doc = await upsertFromErply(remote);
    } catch (e) {
      if (e.code === 11000 && e.keyPattern?.barcode) {
        return res.status(409).json({
          message: "Barcode already exists in MongoDB",
          conflictField: "barcode",
        });
      }
      console.error("importFromErplyById/upsert:", e);
      return res.status(500).json({ message: "Failed to save product from Erply" });
    }

    const data = doc.toObject();
    data.name_i18n = data.name;
    data.description_i18n = data.description;
    data.name = pickLocalized(data.name, "en");
    data.description = pickLocalized(data.description, "en");

    return res.status(200).json({ message: "Imported from Erply", data });
  } catch (e) {
    console.error("importFromErplyById:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
 * IMPORT BY BARCODE
 * =======================================================*/
const importFromErplyByBarcode = async (req, res) => {
  try {
    const { barcode } = req.params;
    const normalized = normalizeBarcode(barcode);

    if (!normalized) {
      return res
        .status(400)
        .json({ message: "Invalid barcode: expected 4–14 digits" });
    }

    const remote = await fetchProductByBarcode(normalized);
    if (!remote) return res.status(404).json({ message: "Erply product not found" });

    let doc;
    try {
      doc = await upsertFromErply(remote);
    } catch (e) {
      if (e.code === 11000 && e.keyPattern?.barcode) {
        return res.status(409).json({
          message: "Barcode already exists in MongoDB",
          conflictField: "barcode",
        });
      }
      console.error("importByBarcode/upsert:", e);
      return res.status(500).json({ message: "Failed to save product from Erply" });
    }

    const data = doc.toObject();
    data.name_i18n = data.name;
    data.description_i18n = data.description;
    data.name = pickLocalized(data.name, "en");
    data.description = pickLocalized(data.description, "en");

    return res.status(200).json({ message: "Imported from Erply", data });
  } catch (e) {
    console.error("importFromErplyByBarcode:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
 * ENSURE BY BARCODE
 * =======================================================*/
const ensureByBarcode = async (req, res) => {
  try {
    const uiLang = pickLangFromReq(req) || "en";
    const raw = String(req.params.barcode || "").trim();
    const normalized = normalizeBarcode(raw);

    if (!normalized) {
      const msgBad = {
        ru: "Неверный штрих-код: ожидается 4–14 цифр",
        en: "Invalid barcode: expected 4–14 digits",
        fi: "Virheellinen viivakoodi: odotetaan 4–14 numeroa",
      };
      return res.status(400).json({ message: msgBad[uiLang] || msgBad.en });
    }

    // 1) Всегда сначала идём в ERPLY
    let remote;
    try {
      remote = await fetchProductByBarcode(normalized);
    } catch (e) {
      console.error("ensureByBarcode/fetch:", e);
      const msgErply = {
        ru: "Ошибка обращения к ERPLY. Попробуйте позже.",
        en: "Failed to contact Erply. Please try again later.",
        fi: "Virhe yhteydessä Erplyyn. Yritä myöhemmin uudelleen.",
      };
      return res.status(502).json({ message: msgErply[uiLang] || msgErply.en });
    }

    if (!remote) {
      const msgNotFound = {
        ru: "Товар в ERPLY с таким штрих-кодом не найден",
        en: "Erply product not found for this barcode",
        fi: "Erply-tuotetta tällä viivakoodilla ei löytynyt",
      };
      return res.status(404).json({ message: msgNotFound[uiLang] || msgNotFound.en });
    }

    // 2) Строим данные из Erply
    const minimal = mapErplyMinimal(remote);

    const name_i18n = await buildLocalizedField(minimal.nameStr, "en");
    const desc_i18n = await buildLocalizedField(minimal.descStr, "en");

    const draft = {
      name: pickLocalized(name_i18n, "en"),
      name_i18n,
      description: pickLocalized(desc_i18n, "en"),
      description_i18n: desc_i18n,
      price: minimal.price,
      stock: minimal.stock,
      brand: minimal.brand || undefined,
      barcode: minimal.barcode || normalized,
      erplyId: minimal.erplyId,
      erplySKU: minimal.erplySKU,
      erpSource: "erply",
      forceLang: "en",
    };

    // 3) Проверяем Mongo по erplyId / barcode
    const or = [];
    if (draft.erplyId) or.push({ erplyId: draft.erplyId });
    if (draft.barcode) or.push({ barcode: draft.barcode });

    const existing = or.length ? await Product.findOne({ $or: or }) : null;

    if (existing) {
      const existingObj = existing.toObject();
      existingObj.name_i18n = existingObj.name;
      existingObj.description_i18n = existingObj.description;
      existingObj.name = pickLocalized(existingObj.name, uiLang);
      existingObj.description = pickLocalized(existingObj.description, uiLang);

      const msgDup = {
        ru: "Товар с таким штрих-кодом уже существует",
        en: "A product with this barcode already exists",
        fi: "Tuote tällä viivakoodilla on jo olemassa",
      };

      return res.status(409).json({
        message: msgDup[uiLang] || msgDup.en,
        alreadyExists: true,
        data: draft,      // актуальные данные из Erply
        existing: existingObj, // то, что в Mongo
      });
    }

    const msgOk = {
      ru: "Черновик товара получен из ERPLY",
      en: "Draft product fetched from Erply",
      fi: "Luonnostuote haettu Erplystä",
    };

    return res.status(200).json({
      message: msgOk[uiLang] || msgOk.en,
      alreadyExists: false,
      data: draft,
    });
  } catch (e) {
    console.error("ensureByBarcode:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
 * SYNC STOCK + PRICE FROM ERPLY
 * =======================================================*/
const syncPriceStock = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    if (!product.erplyId) {
      return res.status(400).json({ message: "Product has no erplyId" });
    }

    const result = await syncPriceStockByErplyId(product.erplyId);

    return res.status(200).json({
      message: "Synced stock & price from Erply",
      data: result,
    });
  } catch (e) {
    console.error("syncPriceStock:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  debugErplyById,
  debugErplyByBarcode,
  importFromErplyById,
  importFromErplyByBarcode,
  ensureByBarcode,
  syncPriceStock,
};

