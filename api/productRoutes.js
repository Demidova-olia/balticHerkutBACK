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

// 🔍 Фикс: сначала специфические маршруты
router.get("/search", searchProducts);
router.get("/:categoryId/:subcategoryId", getProductsByCategoryAndSubcategory);
router.get("/:categoryId", getProductsByCategory);
router.get("/:id", getProductById); // ⬅ перемещено ниже
router.get("/", getProducts);

// 🛠 Защищённые маршруты
router.post(
  "/",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  upload.array("images", 5),
  createProduct
);

router.put(
  "/:id",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  upload.array("images", 5),
  updateProduct
);

router.delete(
  "/:id",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  deleteProduct
);

router.delete("/:productId/images/:publicId", deleteProductImage);
router.put("/:productId/images/:publicId", upload.single("image"), updateProductImage);

module.exports = router;
