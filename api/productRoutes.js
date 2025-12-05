const express = require("express");

const productCtrl = require("../controllers/productController");
const erplyCtrl = require("../controllers/productErplyController");

const rolesMiddleware = require("../middlewares/rolesMiddleware");
const authMiddleware = require("../middlewares/authMiddleware");
const ROLES = require("../config/roles");

const upload = require("../middlewares/multer");

const router = express.Router();

/** ===== Erply import/sync (добавить до параметрических) ===== */

// жёсткий импорт по Erply ID
router.post(
  "/import/erply/:erplyId",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  erplyCtrl.importFromErplyById
);

// жёсткий импорт по штрих-коду
router.post(
  "/import-by-barcode/:barcode",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  erplyCtrl.importFromErplyByBarcode
);

// DEBUG: сырой ответ Erply по ID
router.get(
  "/debug/erply/by-id/:erplyId",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  erplyCtrl.debugErplyById
);

// DEBUG: сырой ответ Erply по BARCODE
router.get(
  "/debug/erply/by-barcode/:barcode",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  erplyCtrl.debugErplyByBarcode
);

// если товара нет — создаст из Erply, иначе вернёт локальный
router.get("/ensure-by-barcode/:barcode", erplyCtrl.ensureByBarcode);

// лёгкий синк цены и остатка
router.put(
  "/:id/sync-erply-light",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  erplyCtrl.syncPriceStock
);

/** ===== Read ===== */
router.get("/id/:id", productCtrl.getProductById);
router.get("/search", productCtrl.searchProducts);

/** ===== Image operations (placed BEFORE parametric GETs) ===== */
router.delete(
  "/:productId/images/:publicId",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  productCtrl.deleteProductImage
);

router.put(
  "/:productId/images/:publicId",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  upload.single("image"),
  productCtrl.updateProductImage
);

/** ===== Create/Update/Delete product ===== */
router.post(
  "/",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  upload.array("images", 10),
  productCtrl.createProduct
);

router.put(
  "/:id",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  upload.array("images", 10),
  productCtrl.updateProduct
);

router.delete(
  "/:id",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  productCtrl.deleteProduct
);

/** ===== Parametric category GETs (keep at the end) ===== */
router.get("/:categoryId/:subcategoryId", productCtrl.getProductsByCategoryAndSubcategory);
router.get("/:categoryId", productCtrl.getProductsByCategory);
router.get("/", productCtrl.getProducts);

module.exports = router;
