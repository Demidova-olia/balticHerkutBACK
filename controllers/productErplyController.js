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
 *  - всегда тянем из Erply
 *  - сохраняем / обновляем в Mongo через upsertFromErply
 *  - если в Mongo уже есть другой товар с таким же barcode → 409
 *  - цена и сток в Mongo = как в Erply
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

    let doc;
    try {
      // upsertFromErply должен:
      //  - посчитать minimal = mapErplyMinimal(remote)
      //  - обновить price и stock из Erply
      //  - сохранить / создать Product в Mongo
      doc = await upsertFromErply(remote);
    } catch (e) {
      // нарушение уникальности штрих-кода
      if (e && e.code === 11000 && e.keyPattern && e.keyPattern.barcode) {
        return res.status(409).json({
          message: "Barcode already exists in MongoDB",
          conflictField: "barcode",
        });
      }
      console.error("importFromErplyById / upsertFromErply error:", e);
      return res.status(500).json({ message: "Failed to save product from Erply" });
    }

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
 *  - всегда тянем из Erply по штрих-коду
 *  - сохраняем / обновляем в Mongo через upsertFromErply
 *  - если barcode уже занят другим продуктом → 409
 *  - цена и сток в Mongo = как в Erply
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

    let doc;
    try {
      doc = await upsertFromErply(remote);
    } catch (e) {
      if (e && e.code === 11000 && e.keyPattern && e.keyPattern.barcode) {
        return res.status(409).json({
          message: "Barcode already exists in MongoDB",
          conflictField: "barcode",
        });
      }
      console.error("importFromErplyByBarcode / upsertFromErply error:", e);
      return res.status(500).json({ message: "Failed to save product from Erply" });
    }

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
 *
 *  ЛОГИКА:
 *   1) ВСЕГДА сначала обращаемся в Erply по штрих-коду
 *      - если там нет товара → 404
 *   2) Строим "draft" из Erply:
 *      - name, description
 *      - price (цена из Erply)
 *      - stock (остаток из Erply)
 *      - barcode, erplyId, erplySKU
 *   3) Проверяем Mongo:
 *      - если уже есть продукт с таким erplyId или barcode → 409
 *        (возвращаем и draft из Erply, и existing из Mongo)
 *      - если нет → 200 с draft (черновик для формы создания)
 *
 *  Важно:
 *   - barcode в Mongo уникален (индекс в productSchema)
 *   - новый продукт с уже существующим barcode создать нельзя
 * =======================================================*/
const ensureByBarcode = async (req, res) => {
  try {
    const uiLang = pickLangFromReq(req) || "en";
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

    // 1) ВСЕГДА сначала идём в ERPLY
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

    // 2) Минимальные данные из Erply — ИСТИНА для price, stock, barcode
    const minimal = mapErplyMinimal(remote);

    const name_i18n = await buildLocalizedField(minimal.nameStr, "en");
    const desc_i18n = await buildLocalizedField(minimal.descStr, "en");

    const draft = {
      // НЕТ _id — это ещё НЕ сохранённый продукт
      name: pickLocalized(name_i18n, "en"),
      name_i18n,
      description: pickLocalized(desc_i18n, "en"),
      description_i18n: desc_i18n,

      price: minimal.price,                  // 👈 ЦЕНА ИЗ ERPLY
      stock: minimal.stock,                  // 👈 СТОК ИЗ ERPLY

      brand: minimal.brand || undefined,
      barcode: minimal.barcode || barcode,   // 👈 BARCODE из Erply (если есть)
      erplyId: minimal.erplyId,
      erplySKU: minimal.erplySKU,
      erpSource: "erply",
      forceLang: "en",
    };

    // 3) Проверяем, есть ли в Mongo продукт с таким erplyId или barcode
    const or = [];
    if (draft.erplyId) or.push({ erplyId: draft.erplyId });
    if (draft.barcode) or.push({ barcode: draft.barcode });

    const existing = or.length
      ? await Product.findOne({ $or: or })
      : null;

    if (existing) {
      const msgDup = {
        ru: "Товар с таким штрих-кодом уже существует",
        en: "A product with this barcode already exists",
        fi: "Tuote tällä viivakoodilla on jo olemassa",
      };

      const existingObj = existing.toObject();
      existingObj.name_i18n = existingObj.name;
      existingObj.description_i18n = existingObj.description;
      existingObj.name = pickLocalized(existingObj.name, uiLang);
      existingObj.description = pickLocalized(existingObj.description, uiLang);

      // 409 — есть уже сохранённый продукт в Mongo.
      // Отдаём:
      //  - existing: то, что в базе (с _id)
      //  - data: актуальный draft из Erply (price/stock/barcode)
      return res.status(409).json({
        message: msgDup[uiLang] || msgDup.en,
        alreadyExists: true,
        data: draft,          // актуальное состояние из Erply
        existing: existingObj // сохранённый продукт из Mongo (c _id)
      });
    }

    // 4) В Mongo ещё нет → отдаём черновик для формы создания
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
    console.error("ensureByBarcode error (outer catch):", e);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =========================================================
 * SYNC STOCK + PRICE
 *  - берём erplyId из Mongo
 *  - syncPriceStockByErplyId должен сходить в Erply,
 *    и обновить product.stock И product.price по данным Erply.
 * =======================================================*/
const syncPriceStock = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    if (!product.erplyId) {
      return res.status(400).json({ message: "Product has no erplyId" });
    }

    // Ожидается, что syncPriceStockByErplyId:
    //  - дергает Erply (fetchProductById / stock API)
    //  - считает minimal = mapErplyMinimal(...)
    //  - обновляет product.stock И product.price
    const result = await syncPriceStockByErplyId(product.erplyId);

    return res.status(200).json({
      message: "Synced stock & price from Erply",
      data: result,
    });
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
