const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Uploads an image buffer to Cloudinary.
 * @param {Buffer} buffer - File buffer (received via multer memoryStorage).
 * @param {string} filename - File name (used as public_id).
 * @returns {Promise<{url: string, public_id: string}>}
 */
const uploadToCloudinary = (buffer, filename) => {
  return new Promise((resolve, reject) => {
    console.log("📦 Attempting to upload file to Cloudinary:", filename);

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
          console.log("✅ Successfully uploaded to Cloudinary:", result.secure_url);
          resolve({
            url: result.secure_url,
            public_id: result.public_id,
          });
        }
      }
    );

    if (!buffer) {
      console.error("❗ Empty buffer, nothing to upload to Cloudinary.");
      reject(new Error("Buffer is empty or undefined"));
    } else {
      streamifier.createReadStream(buffer).pipe(uploadStream);
    }
  });
};

module.exports = { uploadToCloudinary };
