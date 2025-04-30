const express = require("express");
const {
  createSubcategory,
  getSubcategories,
  updateSubcategory,
  deleteSubcategory,
} = require("../controllers/subcategoryController");

const router = express.Router();

router.get("/", getSubcategories);
router.post("/", createSubcategory);
router.put("/:id", updateSubcategory);
router.delete("/:id", deleteSubcategory);

module.exports = router;
