// api/productRoutes.js
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
} = require("../controllers/productController");

const rolesMiddleware = require("../middlewares/rolesMiddleware");
const authMiddleware = require("../middlewares/authMiddleware");
const ROLES = require("../config/roles");

const upload = require("../middlewares/multer");

const router = express.Router();

/** ===== Read ===== */
router.get("/id/:id", getProductById);
router.get("/search", searchProducts);
router.get("/:categoryId/:subcategoryId", getProductsByCategoryAndSubcategory);
router.get("/:categoryId", getProductsByCategory);
router.get("/", getProducts);

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

module.exports = router;
