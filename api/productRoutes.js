const express = require("express");
const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductsByCategory,
  searchProducts,
} = require("../controllers/productController");
const rolesMiddleware = require("../middlewares/rolesMiddleware");
const authMiddleware = require("../middlewares/authMiddleware");
const ROLES = require("../config/roles");
const productImagesMiddleware = require("../middlewares/productImageMiddleware");

const router = express.Router();

router.get("/search", searchProducts);
router.get("/", getProducts);
router.get("/category/:categoryName", getProductsByCategory);
router.get("/:id", getProductById);
router.post("/", productImagesMiddleware, createProduct);
router.put(
  "/:id",
  authMiddleware,
  productImagesMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  updateProduct
);
router.delete(
  "/:id",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  deleteProduct
);

module.exports = router;
