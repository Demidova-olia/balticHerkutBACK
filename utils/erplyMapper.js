const crypto = require("crypto");

function hashFromErply(p) {
  const basis = JSON.stringify({
    name: p.name,
    description: p.description || p.longdesc || "",
    price: p.priceWithVAT ?? p.price ?? 0,
    brand: p.brandName || "",
    barcode: p.code || "",
    images: (p.pictures || []).map((x) => x.fullURL || x.thumbnailURL || x.url),
    stock: p.amountInStock ?? 0,
  });
  return crypto.createHash("sha1").update(basis).digest("hex");
}

function mapErplyToProductFields(erplyProduct) {
  const name = (erplyProduct.name || "").trim();
  const desc = (erplyProduct.description || erplyProduct.longdesc || "").trim();

  const name_i18n = { en: name, _source: "en", _mt: {} };
  const desc_i18n = { en: desc, _source: "en", _mt: {} };

  const images = (erplyProduct.pictures || []).map((pic) => ({
    url: pic.fullURL || pic.thumbnailURL || pic.url,
    public_id: "default_local_image",
    sourceUrl: pic.fullURL || pic.thumbnailURL || pic.url,
  }));

  return {
    mapped: {
      name: name_i18n,
      description: desc_i18n,
      price: Number(erplyProduct.priceWithVAT ?? erplyProduct.price ?? 0),
      stock: Number(erplyProduct.amountInStock ?? 0),
      brand: erplyProduct.brandName || undefined,
      barcode: erplyProduct.code || undefined,
      images,
      erplyId: String(erplyProduct.productID),
      erplySKU: erplyProduct.code2 || undefined,
      erpSource: "erply",
      isActive: true,
    },
    hash: hashFromErply(erplyProduct),
  };
}

module.exports = { mapErplyToProductFields };
