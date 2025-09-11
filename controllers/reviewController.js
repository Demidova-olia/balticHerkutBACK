// controllers/reviewController.js
const mongoose = require("mongoose");
const Review = require("../models/reviewModel");
const Product = require("../models/productModel");

const { pickLangFromReq, pickLocalized } = require("../utils/translator");

// Нормализуем "комментарий" для ответа: если это i18n-объект — локализуем, если строка — отдаём как есть.
const normalizeCommentForResponse = (rawComment, req) => {
  try {
    // если объект вида {ru,en,fi,_source}
    if (rawComment && typeof rawComment === "object") {
      const want = pickLangFromReq(req);
      return pickLocalized(rawComment, want);
    }
    // строка или пусто
    return rawComment || "";
  } catch {
    return typeof rawComment === "string" ? rawComment : "";
  }
};

const createReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const productId = req.params.id;

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ message: "Invalid product id" });
    }

    const r = Number(rating);
    if (!Number.isFinite(r) || r < 1 || r > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const existingReview = await Review.findOne({
      userId: req.user._id,
      productId,
    });
    if (existingReview) {
      return res.status(400).json({ message: "You have already reviewed this product" });
    }

    // Пишем комментарий как есть (строка или объект) — зависит от схемы.
    const review = new Review({
      userId: req.user._id,
      productId,
      rating: r,
      comment: typeof comment === "string" ? comment.trim() : comment,
    });

    await review.save();

    // Пересчет среднего
    const all = await Review.find({ productId }).select("rating").lean();
    const avg = all.length
      ? Math.round((all.reduce((acc, x) => acc + Number(x.rating || 0), 0) / all.length) * 10) / 10
      : 0;

    await Product.findByIdAndUpdate(productId, { averageRating: avg }, { new: false });

    // Готовим ответ
    const out = review.toObject();
    out.comment = normalizeCommentForResponse(out.comment, req);

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

    const { rating, comment } = req.body || {};

    if (typeof rating !== "undefined") {
      const r = Number(rating);
      if (!Number.isFinite(r) || r < 1 || r > 5) {
        return res.status(400).json({ message: "Rating must be between 1 and 5" });
      }
      review.rating = r;
    }

    if (typeof comment !== "undefined") {
      review.comment = typeof comment === "string" ? comment.trim() : comment;
    }

    await review.save();

    const out = review.toObject();
    out.comment = normalizeCommentForResponse(out.comment, req);

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
      .populate("userId", "username email") // было 'name' — заменил на корректные поля
      .sort({ createdAt: -1 })
      .lean();

    const out = reviews.map((r) => ({
      ...r,
      comment: normalizeCommentForResponse(r.comment, req),
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

    review.comment = normalizeCommentForResponse(review.comment, req);

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
