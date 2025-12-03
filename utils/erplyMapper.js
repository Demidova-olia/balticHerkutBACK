// utils/erplyMapper.js
const crypto = require("crypto");
const { mapErplyMinimal } = require("../services/erplySyncService");

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

function collectImages(erply) {
  const out = [];

  if (Array.isArray(erply?.pictures)) {
    for (const p of erply.pictures) {
      const url =
        p?.fullURL || p?.thumbURL || p?.thumbnailURL || p?.url;
      if (url) {
        out.push({
          url,
          public_id: "default_local_image",
          sourceUrl: url,
        });
      }
    }
  }

  if (erply?.imageURL) {
    out.push({
      url: erply.imageURL,
      public_id: "default_local_image",
      sourceUrl: erply.imageURL,
    });
  }
  if (erply?.pictureURL) {
    out.push({
      url: erply.pictureURL,
      public_id: "default_local_image",
      sourceUrl: erply.pictureURL,
    });
  }

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
  // Берём все основные поля из того же места, что использует upsertFromErply
  const minimal = mapErplyMinimal(erply);

  const images = collectImages(erply);

  const mapped = {
    name: makeLocalized(minimal.nameStr || "No name"),
    description: makeLocalized(minimal.descStr || ""),
    price: minimal.price,
    stock: minimal.stock,

    brand: minimal.brand || undefined,
    barcode: minimal.barcode,
    images,
    isActive: true,

    erplyId: minimal.erplyId,
    erplySKU: minimal.erplySKU,
    erpSource: "erply",
  };

  const hash = buildHash(mapped);

  return { mapped, hash };
}

module.exports = { mapErplyToProductFields };
