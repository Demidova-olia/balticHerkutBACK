const express = require("express");
const router = express.Router();
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

// конфигурация Cloudinary уже сделана в app.js, но можно продублировать
cloudinary.config({
  cloud_name: 'diw6ugcy3',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "uploads",
    allowed_formats: ["jpg", "png", "jpeg"],
  },
});

const upload = multer({ storage });

router.post("/upload", upload.single("image"), (req, res) => {
  if (!req.file || !req.file.path) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  res.status(200).json({
    url: req.file.path,
    public_id: req.file.filename,
  });
});

module.exports = router;
