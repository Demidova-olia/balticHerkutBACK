// api/aboutRoutes.js
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const rolesMiddleware = require("../middlewares/rolesMiddleware");
const upload = require("../middlewares/multer"); // память/диск — как у тебя настроено

const { getAbout, updateAbout } = require("../controllers/aboutController");

// GET /api/about
//  - вернуть сырые данные (все языки):            GET /api/about
//  - вернуть «разрешённые» под язык строки:       GET /api/about?resolve=1&lang=ru
router.get("/", getAbout);

// PUT /api/about  (только админ)
// Можно слать:
//  - JSON                    (строки + опц. lang)
//  - multipart/form-data     (payload: JSON + файлы heroImage/storeImage/requisitesImage)
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
