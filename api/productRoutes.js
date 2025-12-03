const express = require("express");

const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductsByCategory,
  getProductsByCategoryAndSubcategory,
  searchProducts,
  deleteProductImage,
  updateProductImage,

  // NEW:
  importFromErplyById,
  importFromErplyByBarcode,
  ensureByBarcode,
  syncPriceStock,
} = require("../controllers/productController");

const rolesMiddleware = require("../middlewares/rolesMiddleware");
const authMiddleware = require("../middlewares/authMiddleware");
const ROLES = require("../config/roles");

const upload = require("../middlewares/multer");

const router = express.Router();

/** ===== Erply import/sync (добавить до параметрических) ===== */
router.post(
  "/import/erply/:erplyId",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  importFromErplyById
);

router.post(
  "/import-by-barcode/:barcode",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  importFromErplyByBarcode
);

// если товара нет — создаст из Erply, иначе вернёт локальный
router.get("/ensure-by-barcode/:barcode", ensureByBarcode);

// лёгкий синк цены и остатка
router.put(
  "/:id/sync-erply-light",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  syncPriceStock
);

/** ===== Read ===== */
router.get("/id/:id", getProductById);
router.get("/search", searchProducts);

/** ===== Image operations (placed BEFORE parametric GETs) ===== */
router.delete(
  "/:productId/images/:publicId",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  deleteProductImage
);

router.put(
  "/:productId/images/:publicId",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  upload.single("image"),
  updateProductImage
);

/** ===== Create/Update/Delete product ===== */
router.post(
  "/",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  upload.array("images", 10),
  createProduct
);

router.put(
  "/:id",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  upload.array("images", 10),
  updateProduct
);

router.delete(
  "/:id",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  deleteProduct
);

/** ===== Parametric category GETs (keep at the end) ===== */
router.get("/:categoryId/:subcategoryId", getProductsByCategoryAndSubcategory);
router.get("/:categoryId", getProductsByCategory);
router.get("/", getProducts);

module.exports = router;
