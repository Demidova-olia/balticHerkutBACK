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
    } catch {

    }
  }
  return out;
}

async function upsertFromErply(erplyProduct) {
  const { mapped, hash } = mapErplyToProductFields(erplyProduct);

  const byErply = mapped.erplyId
    ? await Product.findOne({ erplyId: String(mapped.erplyId) })
    : null;

  const byBarcode = mapped.barcode
    ? await Product.findOne({ barcode: mapped.barcode })
    : null;

  const existing = byErply || byBarcode;

  const cloudImgs = await uploadRemoteImagesToCloudinary(mapped.images || []);
  if (cloudImgs.length) mapped.images = cloudImgs;

  if (!existing) {
    const created = await Product.create({
      ...mapped,
      erplyHash: hash,
      erplySyncedAt: new Date(),
      erpSource: "erply",
    });
    return created;
  }

  if (Number.isFinite(Number(mapped.price))) existing.price = Number(mapped.price);
  if (Number.isFinite(Number(mapped.stock))) existing.stock = Number(mapped.stock);

  if (existing.erplyHash !== hash) {
    if (mapped.name) existing.name = mapped.name;
    if (mapped.description) existing.description = mapped.description;
    if (typeof mapped.brand !== "undefined") existing.brand = mapped.brand;
    if (cloudImgs.length) existing.images = cloudImgs;
    existing.erplyHash = hash;
  }

  if (mapped.erplyId) existing.erplyId = String(mapped.erplyId);
  if (mapped.erplySKU) existing.erplySKU = mapped.erplySKU;
  if (mapped.barcode) existing.barcode = mapped.barcode;

  existing.erpSource = "erply";
  existing.erplySyncedAt = new Date();

  await existing.save();
  return existing;
}

async function syncPriceStockByErplyId(erplyId) {
  const { fetchProductById } = require("../utils/erplyClient");
  const remote = await fetchProductById(erplyId);
  if (!remote) return null;

  const priceFromErp =
    Number(remote.priceWithVat ?? remote.priceWithVAT ?? remote.price ?? 0);
  const stockFromErp = Number(remote.amountInStock ?? remote.freeQuantity ?? 0);

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

