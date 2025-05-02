const express = require("express");
const {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
  getCategoriesWithSubcategories
} = require("../controllers/categoryController");
const rolesMiddleware = require("../middlewares/rolesMiddleware");
const authMiddleware = require("../middlewares/authMiddleware");
const ROLES = require("../config/roles");

const router = express.Router();

router.get("/", getCategories);
router.get("/with-subcategories", getCategoriesWithSubcategories);
router.post("/", authMiddleware, rolesMiddleware(ROLES.ADMIN), createCategory);
router.put("/:id", authMiddleware, rolesMiddleware(ROLES.ADMIN), updateCategory);
router.delete("/:id", authMiddleware, rolesMiddleware(ROLES.ADMIN), deleteCategory);

module.exports = router;
