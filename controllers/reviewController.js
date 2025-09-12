// controllers/reviewController.js
const mongoose = require("mongoose");
const Review = require("../models/reviewModel");
const Product = require("../models/productModel");
const { pickLangFromReq, pickLocalized } = require("../utils/translator");

function normalizeLocalizedFromBody(body, fieldName) {
  const raw = body?.[fieldName];

  if (raw && typeof raw === "object") {
    const src =
      typeof raw._source === "string" && ["ru", "en", "fi"].includes(raw._source)
        ? raw._source
        : (raw.en && "en") || (raw.ru && "ru") || (raw.fi && "fi") || "en";
    const base = raw[src] || "";
    return {
      ru: raw.ru || base,
      en: raw.en || base,
      fi: raw.fi || base,
      _source: src,
    };
  }

  const ru = body?.[`${fieldName}Ru`];
  const en = body?.[`${fieldName}En`];
  const fi = body?.[`${fieldName}Fi`];
  if (ru || en || fi) {
    const src = en ? "en" : ru ? "ru" : fi ? "fi" : "en";
    const base = (src === "en" ? en : src === "ru" ? ru : fi) || "";
    return {
      ru: ru || base,
      en: en || base,
      fi: fi || base,
      _source: src,
    };
  }


  if (typeof raw === "string") {
    const s = raw.trim();
    const _source = /[А-Яа-яЁё]/.test(s) ? "ru" : "en";
    return { ru: s, en: s, fi: s, _source };
  }

  return undefined;
}

function localizedCommentForResponse(i18nComment, req) {
  const want = pickLangFromReq(req);
  return pickLocalized(i18nComment || {}, want) || "";
}

const createReview = async (req, res) => {
  try {
    const { rating } = req.body;
    const productId = req.params.id;

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "Invalid product id" });
    }

    const r = Number(rating);
    if (!Number.isFinite(r) || r < 1 || r > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const exists = await Review.findOne({
      userId: req.user._id,
      productId,
    });
    if (exists) {
      return res.status(400).json({ message: "You have already reviewed this product" });
    }

    const commentLoc = normalizeLocalizedFromBody(req.body, "comment") || { en: "", ru: "", fi: "", _source: "en" };

    const review = new Review({
      userId: req.user._id,
      productId,
      rating: r,
      comment: commentLoc,
    });

    await review.save();


    const agg = await Review.aggregate([
      { $match: { productId: new mongoose.Types.ObjectId(productId) } },
      { $group: { _id: null, avg: { $avg: "$rating" } } },
    ]);

    const avg = agg.length ? Math.round(agg[0].avg * 10) / 10 : 0;
    await Product.findByIdAndUpdate(productId, { averageRating: avg });

    const out = review.toObject();
    out.comment_i18n = out.comment;
    out.comment = localizedCommentForResponse(out.comment, req);

    return res.status(201).json(out);
  } catch (error) {
    console.error("createReview error:", error);
    return res.status(500).json({
      message: "Something went wrong",
      error: error.message || "Unknown error",
    });
  }
};

const updateReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      return res.status(400).json({ message: "Invalid review id" });
    }

    const review = await Review.findById(reviewId);
    if (!review) return res.status(404).json({ message: "Review not found" });

    if (req.user.role !== "ADMIN" && String(review.userId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { rating } = req.body;
    if (typeof rating !== "undefined") {
      const r = Number(rating);
      if (!Number.isFinite(r) || r < 1 || r > 5) {
        return res.status(400).json({ message: "Rating must be between 1 and 5" });
      }
      review.rating = r;
    }

    const commentLoc = normalizeLocalizedFromBody(req.body, "comment");
    if (typeof commentLoc !== "undefined") {
      review.comment = commentLoc; 
    }

    await review.save();

    const out = review.toObject();
    out.comment_i18n = out.comment;
    out.comment = localizedCommentForResponse(out.comment, req);

    return res.json({ message: "Review updated", review: out });
  } catch (error) {
    console.error("updateReview error:", error);
    return res.status(500).json({ message: "Error updating review", error: error.message });
  }
};

const deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      return res.status(400).json({ message: "Invalid review id" });
    }

    const review = await Review.findById(reviewId);
    if (!review) return res.status(404).json({ message: "Review not found" });

    if (req.user.role !== "ADMIN" && String(review.userId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    await review.deleteOne();
    return res.json({ message: "Review deleted", reviewId });
  } catch (error) {
    console.error("deleteReview error:", error);
    return res.status(500).json({ message: "Error deleting review", error: error.message });
  }
};

const getProductReviews = async (req, res) => {
  try {
    const productId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "Invalid product id" });
    }

    const reviews = await Review.find({ productId })
      .populate("userId", "username email")
      .sort({ createdAt: -1 })
      .lean();

    const out = reviews.map((r) => ({
      ...r,
      comment_i18n: r.comment,
      comment: localizedCommentForResponse(r.comment, req),
    }));

    return res.json(out);
  } catch (error) {
    console.error("getProductReviews error:", error);
    return res.status(500).json({ message: "Error fetching reviews", error: error.message });
  }
};

const getOneReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(reviewId)) {
      return res.status(400).json({ message: "Invalid review id" });
    }

    const review = await Review.findById(reviewId)
      .populate("userId", "username email")
      .lean();

    if (!review) return res.status(404).json({ message: "Review not found" });

    review.comment_i18n = review.comment;
    review.comment = localizedCommentForResponse(review.comment, req);

    return res.json(review);
  } catch (error) {
    console.error("getOneReview error:", error);
    return res.status(500).json({ message: "Error fetching review", error: error.message });
  }
};

module.exports = {
  createReview,
  updateReview,
  deleteReview,
  getProductReviews,
  getOneReview,
};
