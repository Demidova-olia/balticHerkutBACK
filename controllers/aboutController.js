// controllers/aboutController.js
const cloudinary = require("cloudinary").v2;
const AboutContent = require("../models/aboutContentModel");

/**
 * Вспомогательная загрузка изображения в Cloudinary из буфера (multer memoryStorage)
 */
const uploadFromBuffer = (buffer, folder = "about") =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });

/**
 * GET /api/about
 * Возвращает единственный документ с контентом «О нас».
 */
exports.getAbout = async (req, res) => {
  try {
    let doc = await AboutContent.findOne();
    if (!doc) {
      doc = await AboutContent.create({});
    }
    res.status(200).json({ message: "About loaded", data: doc });
  } catch (err) {
    console.error("getAbout error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * PUT /api/about  (только админ)
 * Принимает:
 *  - либо обычный JSON-тelo (application/json),
 *  - либо FormData c полем "payload" (JSON-строка) и файлами:
 *      heroImage, storeImage, requisitesImage
 * Обновляет единственный документ.
 */
exports.updateAbout = async (req, res) => {
  try {
    // Базовые данные: либо JSON-тело, либо JSON-строка в payload
    let body = {};
    if (req.is("application/json")) {
      body = req.body || {};
    } else if (req.body?.payload) {
      try {
        body = JSON.parse(req.body.payload);
      } catch (_) {
        return res.status(400).json({ message: "Invalid payload JSON" });
      }
    } else {
      body = req.body || {};
    }

    // Находим или создаём документ
    let doc = await AboutContent.findOne();
    if (!doc) doc = new AboutContent({});

    // Если присланы файлы — грузим в Cloudinary и подставляем URL
    if (req.files?.heroImage?.[0]?.buffer) {
      const up = await uploadFromBuffer(req.files.heroImage[0].buffer, "about/hero");
      body.heroImageUrl = up.secure_url;
    }
    if (req.files?.storeImage?.[0]?.buffer) {
      const up = await uploadFromBuffer(req.files.storeImage[0].buffer, "about/store");
      body.storeImageUrl = up.secure_url;
    }
    if (req.files?.requisitesImage?.[0]?.buffer) {
      const up = await uploadFromBuffer(req.files.requisitesImage[0].buffer, "about/requisites");
      body.requisitesImageUrl = up.secure_url;
    }

    // Разрешённые поля (соответствуют фронту)
    const fields = [
      "heroImageUrl",
      "title",
      "subtitle",
      "storeImageUrl",
      "descriptionIntro",
      "descriptionMore",
      "address",
      "hours",
      "gmapsUrl",
      "requisitesImageUrl",
      "socialsHandle",
    ];

    for (const key of fields) {
      if (typeof body[key] !== "undefined") {
        doc[key] = body[key];
      }
    }

    // отметим, кто обновил (если в req.user есть _id)
    if (req.user?._id) {
      doc.updatedBy = req.user._id; // поле опционально, если есть в схеме
    }

    await doc.save();
    res.status(200).json({ message: "About updated", data: doc });
  } catch (err) {
    console.error("updateAbout error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
