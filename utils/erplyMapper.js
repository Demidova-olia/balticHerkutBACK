// utils/erplyMapper.js
const crypto = require("crypto");
function makeLocalized(text) {
  const s = String(text || "").trim();
  return {
    ru: "",
    en: s,
    fi: "",
    _source: "en",
    _mt: {},
  };
}
function toSafeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function normalizeBarcode(v) {
  if (v == null) return undefined;
  const digits = String(v).replace(/\D+/g, "");
  if (!digits) return undefined;
  return /^\d{4,14}$/.test(digits) ? digits : undefined;
}

function collectImages(erply) {
  const out = [];

  if (Array.isArray(erply?.pictures)) {
    for (const p of erply.pictures) {
      const url = p?.fullURL || p?.thumbURL || p?.thumbnailURL || p?.url;
      if (url) out.push({ url, public_id: "default_local_image", sourceUrl: url });
    }
  }

  if (erply?.imageURL) out.push({ url: erply.imageURL, public_id: "default_local_image", sourceUrl: erply.imageURL });
  if (erply?.pictureURL) out.push({ url: erply.pictureURL, public_id: "default_local_image", sourceUrl: erply.pictureURL });

  const seen = new Set();
  return out.filter((img) => {
    const u = String(img.url || "").trim();
    if (!u) return false;
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });
}

function buildHash(mapped) {
  const basis = JSON.stringify({
    name_en: mapped?.name?.en || "",
    desc_en: mapped?.description?.en || "",
    brand: mapped?.brand || "",
    barcode: mapped?.barcode || "",
    images: (mapped?.images || []).map((x) => x.url),
  });
  return crypto.createHash("sha1").update(basis, "utf8").digest("hex");
}

function mapErplyToProductFields(erply) {
  const nameRaw =
    erply?.name ||
    erply?.productName ||
    ""; 
  const descRaw =
    erply?.longdesc ||
    erply?.longDescription ||
    erply?.description ||
    "";

  const price = toSafeNumber(
    erply?.priceWithVAT != null ? erply.priceWithVAT : erply?.price,
    0
  );
  const stock = toSafeNumber(
    erply?.amountInStock != null ? erply.amountInStock : erply?.freeAmount,
    0
  );

  const barcode =
    normalizeBarcode(erply?.ean) ||
    normalizeBarcode(erply?.eanCode) ||
    normalizeBarcode(erply?.code) ||
    undefined;

  const images = collectImages(erply);

  const isActive = erply?.active === 0 ? false : true;

  const skuPrimary = erply?.code ? String(erply.code).trim() : undefined;
  const sku2 = erply?.code2 ? String(erply.code2).trim() : undefined;

  const mapped = {
    name: makeLocalized(nameRaw || "No name"),
    description: makeLocalized(descRaw || ""),
    price,
    stock,

    brand: erply?.brandName || erply?.brand || undefined,
    barcode,
    images,
    isActive,

    erplyId: erply?.productID ? String(erply.productID) : undefined,
    erplySKU: skuPrimary || sku2 || undefined,
    erpSource: "erply",
  };

  const hash = buildHash(mapped);

  return { mapped, hash };
}

module.exports = { mapErplyToProductFields };

