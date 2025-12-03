// routes/productRoutes.js (пример)
const express = require("express");
const router = express.Router();

const productCtrl = require("../controllers/productController");
const erplyCtrl = require("../controllers/productErplyController");

// обычные продукты
router.post("/", upload.array("images"), productCtrl.createProduct);
router.get("/", productCtrl.getProducts);
router.get("/search", productCtrl.searchProducts);
router.get("/:id", productCtrl.getProductById);
router.put("/:id", upload.array("images"), productCtrl.updateProduct);
router.delete("/:id", productCtrl.deleteProduct);
router.delete("/:productId/images/:publicId", productCtrl.deleteProductImage);
router.put("/:productId/images/:publicId", upload.single("image"), productCtrl.updateProductImage);

// erply-операции
router.post("/erply/import/id/:erplyId", erplyCtrl.importFromErplyById);
router.post("/erply/import/barcode/:barcode", erplyCtrl.importFromErplyByBarcode);
router.post("/erply/ensure/:barcode", erplyCtrl.ensureByBarcode);
router.post("/:id/erply-sync-price-stock", erplyCtrl.syncPriceStock);

module.exports = router;
