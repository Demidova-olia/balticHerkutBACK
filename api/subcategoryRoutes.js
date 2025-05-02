const express = require("express");
const {
  createSubcategory,
  getSubcategories,
  updateSubcategory,
  deleteSubcategory,
} = require("../controllers/subcategoryController");
const authMiddleware = require("../middlewares/authMiddleware"); 
const rolesMiddleware = require("../middlewares/rolesMiddleware"); 
const ROLES = require("../config/roles"); 

const router = express.Router();

router.get("/", getSubcategories);

router.post(
  "/",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  createSubcategory
);

router.put(
  "/:id",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  updateSubcategory
);

router.delete(
  "/:id",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN),
  deleteSubcategory
);

module.exports = router;

