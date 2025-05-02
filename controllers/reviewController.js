const Review = require('../models/reviewModel');
const Product = require('../models/productModel');

const createReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const productId = req.params.id;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' });
    }

    const existingReview = await Review.findOne({
      userId: req.user._id,
      productId,
    });

    if (existingReview) {
      return res.status(400).json({ message: 'You have already reviewed this product' });
    }

    const review = new Review({
      userId: req.user._id,
      productId,
      rating,
      comment,
    });

    await review.save();

    const allReviews = await Review.find({ productId });
    const average = allReviews.reduce((acc, r) => acc + r.rating, 0) / allReviews.length;

    await Product.findByIdAndUpdate(productId, {
      averageRating: average.toFixed(1),
    });

    res.status(201).json(review);
  } catch (error) {
    res.status(500).json({
      message: 'Something went wrong',
      error: error.message || 'Unknown error',
    });
  }
};

const updateReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.reviewId);
    if (!review) return res.status(404).json({ message: 'Review not found' });

    if (req.user.role !== 'ADMIN' && review.userId.toString() !== req.user._id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    review.rating = req.body.rating ?? review.rating;
    review.comment = req.body.comment ?? review.comment;
    await review.save();

    res.json({ message: 'Review updated', review });
  } catch (error) {
    res.status(500).json({ message: 'Error updating review', error: error.message });
  }
};

const deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.reviewId);
    if (!review) return res.status(404).json({ message: 'Review not found' });

    if (req.user.role !== 'ADMIN' && review.userId.toString() !== req.user._id) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await review.deleteOne();
    res.json({ message: 'Review deleted', review });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting review', error: error.message });
  }
};

const getProductReviews = async (req, res) => {
  try {
    const productId = req.params.id;
    const reviews = await Review.find({ productId })
      .populate('userId', 'name')
      .sort({ createdAt: -1 });

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching reviews', error: error.message });
  }
};

const getOneReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.reviewId).populate('userId', 'name');
    if (!review) return res.status(404).json({ message: 'Review not found' });

    res.json(review);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching review', error: error.message });
  }
};

module.exports = {
  createReview,
  updateReview,
  deleteReview,
  getProductReviews,
  getOneReview,
};
