// api/aboutRoutes.js
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const rolesMiddleware = require("../middlewares/rolesMiddleware"); // уже есть у вас
const upload = require("../middlewares/multer"); // memoryStorage

const {
  getAbout,
  updateAbout,
} = require("../controllers/aboutController");

// GET /api/about
router.get("/", getAbout);

// PUT /api/about  (только админ)
// принимает FormData: payload(JSON) + heroImage / storeImage / requisitesImage (files)
router.put(
  "/",
  authMiddleware,
  rolesMiddleware(["admin"]),
  upload.fields([
    { name: "heroImage", maxCount: 1 },
    { name: "storeImage", maxCount: 1 },
    { name: "requisitesImage", maxCount: 1 },
  ]),
  updateAbout
);

module.exports = router;
