const Product = require("../models/productModel");
const { mapErplyToProductFields } = require("../utils/erplyMapper");
const { downloadImageToBuffer } = require("../utils/downloadImageToBuffer");
const cloudinary = require("cloudinary").v2;

async function uploadRemoteImagesToCloudinary(images) {
  const out = [];
  for (const img of images || []) {
    try {
      const sourceUrl = img.sourceUrl || img.url;
      if (!sourceUrl) continue;
      const buffer = await downloadImageToBuffer(sourceUrl);
      const res = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "products", resource_type: "image" },
          (err, result) => (err ? reject(err) : resolve(result))
        );
        stream.end(buffer);
      });
      out.push({ url: res.secure_url || res.url, public_id: res.public_id, sourceUrl });
    } catch {
      // пропускаем неудачные
    }
  }
  return out;
}

// полный upsert из Erply (с перезаливом картинок)
async function upsertFromErply(erplyProduct) {
  const { mapped, hash } = mapErplyToProductFields(erplyProduct);

  const byErply = await Product.findOne({ erplyId: String(erplyProduct.productID) });
  const byBarcode = mapped.barcode ? await Product.findOne({ barcode: mapped.barcode }) : null;
  const existing = byErply || byBarcode;

  const cloudImgs = await uploadRemoteImagesToCloudinary(mapped.images || []);
  if (cloudImgs.length) mapped.images = cloudImgs;

  if (!existing) {
    const doc = await Product.create({
      ...mapped,
      erplyHash: hash,
      erplySyncedAt: new Date(),
    });
    return doc;
  }

  // обновляем цену/остаток всегда
  existing.price = Number(mapped.price ?? existing.price);
  existing.stock = Number(mapped.stock ?? existing.stock);

  // если контент поменялся — перезаписываем и картинки
  if (existing.erplyHash !== hash) {
    existing.name = mapped.name || existing.name;
    existing.description = mapped.description || existing.description;
    existing.brand = mapped.brand ?? existing.brand;
    if (cloudImgs.length) existing.images = cloudImgs;
    existing.erplyHash = hash;
  }

  existing.erplyId = mapped.erplyId;
  existing.erplySKU = mapped.erplySKU ?? existing.erplySKU;
  existing.erpSource = "erply";
  existing.erplySyncedAt = new Date();

  await existing.save();
  return existing;
}

// лёгкий синк: только price/stock
async function syncPriceStockByErplyId(erplyId) {
  const { fetchProductById } = require("../utils/erplyClient");
  const remote = await fetchProductById(erplyId);
  if (!remote) return null;

  const price = Number(remote.priceWithVAT ?? remote.price ?? 0);
  const stock = Number(remote.amountInStock ?? 0);

  const doc = await Product.findOne({ erplyId: String(erplyId) });
  if (!doc) return null;

  let changed = false;
  if (Number.isFinite(price) && price !== doc.price) { doc.price = price; changed = true; }
  if (Number.isFinite(stock) && stock !== doc.stock) { doc.stock = stock; changed = true; }

  if (changed) {
    doc.erplySyncedAt = new Date();
    await doc.save();
  }
  return { _id: doc._id, changed };
}

module.exports = { upsertFromErply, syncPriceStockByErplyId };
