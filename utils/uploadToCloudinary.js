const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Загружает буфер изображения в Cloudinary.
 * @param {Buffer} buffer - Буфер файла (получен через multer memoryStorage).
 * @param {string} filename - Имя файла (используется как public_id).
 * @returns {Promise<{url: string, public_id: string}>}
 */
const uploadToCloudinary = (buffer, filename) => {
  return new Promise((resolve, reject) => {
    console.log("📦 Пытаюсь загрузить в Cloudinary файл:", filename);

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "products",
        public_id: filename,
        resource_type: "image",
        overwrite: true,
      },
      (error, result) => {
        if (error) {
          console.error("❌ Cloudinary upload error:", error);
          reject(error);
        } else {
          console.log("✅ Успешно загружено в Cloudinary:", result.secure_url);
          resolve({
            url: result.secure_url,
            public_id: result.public_id,
          });
        }
      }
    );

    // Если buffer пустой или не передан, это тоже надо ловить
    if (!buffer) {
      console.error("❗ Пустой буфер, ничего не загружаю в Cloudinary.");
      reject(new Error("Buffer is empty or undefined"));
    } else {
      streamifier.createReadStream(buffer).pipe(uploadStream);
    }
  });
};

module.exports = { uploadToCloudinary };
