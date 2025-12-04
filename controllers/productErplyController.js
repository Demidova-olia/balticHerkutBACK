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

function normalizeBarcode(raw) {
  if (raw == null) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  if (!BARCODE_RE.test(s)) return null;
  return s;
}

/* =========================================================
 * IMPORT BY ERPLY ID (жёсткий импорт в БД)
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

    // для ответов по Erply считаем базовый язык EN
    const want = "en";
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
 * IMPORT BY BARCODE (жёсткий импорт в БД)
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

    const want = "en";
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
 * ENSURE BY BARCODE
 *  - если товар есть локально → 409 + существующий
 *  - если нет → ТОЛЬКО тянем из Erply и возвращаем ЧЕРНОВИК для формы
 * =======================================================*/
const ensureByBarcode = async (req, res) => {
  try {
    const uiLang = pickLangFromReq(req) || "en"; // для текста сообщений
    const rawBarcode = String(req.params.barcode || "").trim();

    const normalized = normalizeBarcode(rawBarcode);
    if (normalized === null || !normalized) {
      const msg = {
        ru: "Неверный штрих-код: ожидается 4–14 цифр",
        en: "Invalid barcode: expected 4–14 digits",
        fi: "Virheellinen viivakoodi: odotetaan 4–14 numeroa",
      };
      return res.status(400).json({ message: msg[uiLang] || msg.en });
    }
    const barcode = normalized;

    // 1) проверяем, нет ли уже такого товара в локальной БД
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
      data.name = pickLocalized(data.name, uiLang);
      data.description = pickLocalized(data.description, uiLang);

      return res.status(409).json({ message: msgDup[uiLang] || msgDup.en, data });
    }

    // 2) тянем из Erply, НО НЕ СОЗДАЁМ продукт в Mongo
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
      return res.status(502).json({ message: msgErplyDown[uiLang] || msgErplyDown.en });
    }

    if (!remote) {
      const msgNotFound = {
        ru: "Товар в ERPLY с таким штрих-кодом не найден",
        en: "Erply product not found for this barcode",
        fi: "Erply-tuotetta tällä viivakoodilla ei löytynyt",
      };
      return res.status(404).json({ message: msgNotFound[uiLang] || msgNotFound.en });
    }

    // Минимальные данные из Erply
    const minimal = mapErplyMinimal(remote);

    // ВАЖНО: считаем, что Erply всегда отдаёт английский текст
    const name_i18n = await buildLocalizedField(minimal.nameStr, "en");
    const desc_i18n = await buildLocalizedField(minimal.descStr, "en");

    const draft = {
      // НЕТ _id — это ещё НЕ сохранённый продукт
      name: pickLocalized(name_i18n, "en"),
      name_i18n,
      description: pickLocalized(desc_i18n, "en"),
      description_i18n: desc_i18n,
      price: minimal.price,
      stock: minimal.stock,
      brand: minimal.brand || undefined,
      barcode: minimal.barcode || barcode,
      erplyId: minimal.erplyId,
      erplySKU: minimal.erplySKU,
      erpSource: "erply",
      // можно подсказать фронту, что логичен английский интерфейс
      forceLang: "en",
    };

    const msgOk = {
      ru: "Черновик товара получен из ERPLY",
      en: "Draft product fetched from Erply",
      fi: "Luonnostuote haettu Erplystä",
    };

    return res.status(200).json({ message: msgOk[uiLang] || msgOk.en, data: draft });
  } catch (e) {
    console.error("ensureByBarcode error (outer catch):", e);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
 * SYNC STOCK (теперь у тебя в сервисе меняется только stock)
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
    return res.status(200).json({ message: "Synced stock from Erply", data: result });
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
