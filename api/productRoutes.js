// routes/productRoutes.js
const express = require("express");
const multer = require("multer");

const router = express.Router();
const upload = multer(); // in-memory, как и раньше

const productCtrl = require("../controllers/productController");
const erplyCtrl = require("../controllers/productErplyController");

/* =========================================================
 * Обычные продукты (CRUD + поиск + категории)
 * =======================================================*/

// создать продукт (с картинками)
router.post("/", upload.array("images"), productCtrl.createProduct);

// список с фильтрами / пагинацией
router.get("/", productCtrl.getProducts);

// поиск по строке ?q=...
router.get("/search", productCtrl.searchProducts);

// получить по ID (ФРОНТ ждёт /products/id/:id)
router.get("/id/:id", productCtrl.getProductById);

// по категории + подкатегории
router.get("/:categoryId/:subcategoryId", productCtrl.getProductsByCategoryAndSubcategory);

// по категории
router.get("/:categoryId", productCtrl.getProductsByCategory);

// обновить продукт (с картинками)
router.put("/:id", upload.array("images"), productCtrl.updateProduct);

// удалить продукт
router.delete("/:id", productCtrl.deleteProduct);

// удалить одну картинку
router.delete("/:productId/images/:publicId", productCtrl.deleteProductImage);

// обновить одну картинку
router.put(
  "/:productId/images/:publicId",
  upload.single("image"),
  productCtrl.updateProductImage
);

/* =========================================================
 * ERPLY-операции (под фронтовые пути!)
 * =======================================================*/

// ensureByBarcode(barcode) – SAFE GET
// фронт: GET /api/products/ensure-by-barcode/:barcode
router.get("/ensure-by-barcode/:barcode", erplyCtrl.ensureByBarcode);

// importFromErplyById(erplyId)
// фронт: POST /api/products/import/erply/:erplyId
router.post("/import/erply/:erplyId", erplyCtrl.importFromErplyById);

// importFromErplyByBarcode(barcode)
// фронт: POST /api/products/import-by-barcode/:barcode
router.post("/import-by-barcode/:barcode", erplyCtrl.importFromErplyByBarcode);

// syncPriceStock(productId)
// фронт: PUT /api/products/:id/sync-erply-light
router.put("/:id/sync-erply-light", erplyCtrl.syncPriceStock);

module.exports = router;
