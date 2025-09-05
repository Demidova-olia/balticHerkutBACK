// api/aboutRoutes.js
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const rolesMiddleware = require("../middlewares/rolesMiddleware");
const upload = require("../middlewares/multer");

const { getAbout, updateAbout } = require("../controllers/aboutController");

router.get("/", getAbout);

router.put(
  "/",
  authMiddleware,
  rolesMiddleware(["admin"]), // теперь корректно обрабатывается и массив, и строка
  upload.fields([
    { name: "heroImage", maxCount: 1 },
    { name: "storeImage", maxCount: 1 },
    { name: "requisitesImage", maxCount: 1 },
  ]),
  updateAbout
);

module.exports = router;
