const express = require("express");
const router = express.Router();
const multer = require("multer");
const { Readable } = require("stream");
const cloudinary = require("../config/cloudinary");

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post("/upload", upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Файл не передан" });
    }

    const stream = cloudinary.uploader.upload_stream(
      { folder: "uploads" },
      (error, result) => {
        if (error) {
          console.error("Cloudinary error:", error);
          return res.status(500).json({ error });
        }

        return res.status(200).json({
          url: result.secure_url,
          public_id: result.public_id,
        });
      }
    );

    // pipe из буфера в cloudinary stream
    Readable.from(req.file.buffer).pipe(stream);

  } catch (err) {
    console.error("Ошибка загрузки:", err);
    res.status(500).json({ message: "Ошибка загрузки" });
  }
});

module.exports = router;
