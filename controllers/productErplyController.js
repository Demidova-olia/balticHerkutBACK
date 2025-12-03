// controllers/productErplyController.js
const mongoose = require("mongoose");
const Product = require("../models/productModel");

const { fetchProductById, fetchProductByBarcode } = require("../utils/erplyClient");
const { upsertFromErply, syncPriceStockByErplyId } = require("../services/erplySyncService");
const { pickLangFromReq, pickLocalized } = require("../utils/translator");

// 4–14 цифр
const BARCODE_RE = /^\d{4,14}$/;

function normalizeBarcode(raw) {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  if (!BARCODE_RE.test(s)) return null;
  return s;
}

/* =========================================================
 * IMPORT BY ERPLY ID
 * =======================================================*/
const importFromErplyById = async (req, res) => {
  try {
    const { erplyId } = req.params;
    if (!erplyId) {
      return res.status(400).json({ message: "erplyId is required" });
    }

    const remote = await fetchProductById(erplyId);
    if (!remote) {
      return res.status(404).json({ message: "Erply product not found" });
    }

    const doc = await upsertFromErply(remote);

    const want = pickLangFromReq(req);
    const data = doc.toObject();
    data.name_i18n = data.name;
    data.description_i18n = data.description;
    data.name = pickLocalized(data.name, want);
    data.description = pickLocalized(data.description, want);

    return res.status(200).json({ message: "Imported from Erply", data });
  } catch (e) {
    console.error("importFromErplyById", e);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
 * IMPORT BY BARCODE
 * =======================================================*/
const importFromErplyByBarcode = async (req, res) => {
  try {
    const { barcode } = req.params;
    if (!barcode) {
      return res.status(400).json({ message: "barcode is required" });
    }
    if (!BARCODE_RE.test(String(barcode))) {
      return res.status(400).json({ message: "Invalid barcode: expected 4–14 digits" });
    }

    const remote = await fetchProductByBarcode(barcode);
    if (!remote) {
      return res.status(404).json({ message: "Erply product not found" });
    }

    const doc = await upsertFromErply(remote);

    const want = pickLangFromReq(req);
    const data = doc.toObject();
    data.name_i18n = data.name;
    data.description_i18n = data.description;
    data.name = pickLocalized(data.name, want);
    data.description = pickLocalized(data.description, want);

    return res.status(200).json({ message: "Imported from Erply", data });
  } catch (e) {
    console.error("importFromErplyByBarcode", e);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
 * ENSURE BY BARCODE (если нет – импорт из Erply)
 * =======================================================*/
const ensureByBarcode = async (req, res) => {
  try {
    const lang = pickLangFromReq(req) || "en";
    const rawBarcode = String(req.params.barcode || "").trim();

    const normalized = normalizeBarcode(rawBarcode);
    if (normalized === null || !normalized) {
      const msg = {
        ru: "Неверный штрих-код: ожидается 4–14 цифр",
        en: "Invalid barcode: expected 4–14 digits",
        fi: "Virheellinen viivakoodi: odotetaan 4–14 numeroa",
      };
      return res.status(400).json({ message: msg[lang] || msg.en });
    }
    const barcode = normalized;

    // Проверяем, нет ли уже такого товара
    const existing = await Product.findOne({ barcode });
    if (existing) {
      const msgDup = {
        ru: "Товар с таким штрих-кодом уже существует",
        en: "A product with this barcode already exists",
        fi: "Tuote tällä viivakoodilla on jo olemassa",
      };

      const data = existing.toObject();
      data.name_i18n = data.name;
      data.description_i18n = data.description;
      data.name = pickLocalized(data.name, lang);
      data.description = pickLocalized(data.description, lang);

      return res.status(409).json({ message: msgDup[lang] || msgDup.en, data });
    }

    // Тянем из Erply
    let remote;
    try {
      remote = await fetchProductByBarcode(barcode);
    } catch (e) {
      console.error("ensureByBarcode: fetchProductByBarcode error:", e?.message || e);
      const msgErplyDown = {
        ru: "Ошибка обращения к ERPLY. Попробуйте позже.",
        en: "Failed to contact Erply. Please try again later.",
        fi: "Virhe yhteydessä Erplyyn. Yritä myöhemmin uudelleen.",
      };
      return res.status(502).json({ message: msgErplyDown[lang] || msgErplyDown.en });
    }

    if (!remote) {
      const msgNotFound = {
        ru: "Товар в ERPLY с таким штрих-кодом не найден",
        en: "Erply product not found for this barcode",
        fi: "Erply-tuotetta tällä viivakoodilla ei löytynyt",
      };
      return res.status(404).json({ message: msgNotFound[lang] || msgNotFound.en });
    }

    // Здесь ВСЮ магию делает upsertFromErply:
    //   - создаёт/обновляет товар
    //   - создаёт категорию imported (если нужно)
    //   - пишет erplyId, erplySKU и т.п.
    const doc = await upsertFromErply(remote);

    const data = doc.toObject();
    data.name_i18n = data.name;
    data.description_i18n = data.description;
    data.name = pickLocalized(data.name, lang);
    data.description = pickLocalized(data.description, lang);

    const msgOk = {
      ru: "Товар импортирован из ERPLY",
      en: "Product imported from Erply",
      fi: "Tuote tuotu Erplystä",
    };

    return res.status(201).json({ message: msgOk[lang] || msgOk.en, data });
  } catch (e) {
    console.error("ensureByBarcode error (outer catch):", e);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
 * SYNC PRICE/STOCK
 * =======================================================*/
const syncPriceStock = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    if (!product.erplyId) return res.status(400).json({ message: "Product has no erplyId" });

    const result = await syncPriceStockByErplyId(product.erplyId);
    return res.status(200).json({ message: "Synced price & stock", data: result });
  } catch (e) {
    console.error("syncPriceStock", e);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  importFromErplyById,
  importFromErplyByBarcode,
  ensureByBarcode,
  syncPriceStock,
};
