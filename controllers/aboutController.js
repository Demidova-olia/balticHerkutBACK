const AboutContent = require('../models/AboutContent');

exports.getAbout = async (req, res) => {
  const doc = await AboutContent.findOne() || await AboutContent.create({});
  res.json({ data: doc });
};

exports.updateAbout = async (req, res) => {
  // req.user должен быть админом (через ваш authMiddleware)
  const body = JSON.parse(req.body.payload || '{}');

  // если приходят файлы (multer memoryStorage) — загрузите в Cloudinary и подставьте URL
  // пример:
  // if (req.files?.storeImage?.[0]) body.store.imageUrl = uploadedSecureUrl;
  // if (req.files?.requisitesImage?.[0]) body.requisitesImageUrl = uploadedSecureUrl;
  // if (req.files?.heroImage?.[0]) body.heroImageUrl = uploadedSecureUrl;

  let doc = await AboutContent.findOne();
  if (!doc) doc = new AboutContent();

  Object.assign(doc, body, { updatedBy: req.user?._id });
  await doc.save();

  res.json({ message: 'Updated', data: doc });
};
