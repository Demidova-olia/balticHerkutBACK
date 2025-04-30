const Review = require('../models/reviewModel')
const Product = require('../models/productModel')

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
        existingReview.rating = rating;
        existingReview.comment = comment;
        await existingReview.save();
        return res.status(200).json({ message: "Review updated", review: existingReview });
      }

      const review = new Review({
        userId: req.user._id,
        productId,
        rating,
        comment,
      });
  
      await review.save();

      const allReviews = await Review.find({ productId });
  
      const average =
        allReviews.reduce((acc, r) => acc + r.rating, 0) / allReviews.length;
  
      await Product.findByIdAndUpdate(productId, {
        averageRating: average.toFixed(1),
      });
  
      res.status(201).json(review);
    } catch (error) {
      console.log("Review creation error:", error); 

      if (error.errors) {
        console.log("Validation errors:", error.errors);
      }
  
      res.status(500).json({
        message: 'Something went wrong',
        error: error.message || 'Unknown error',
      });
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
    res.status(500).json({ message: 'Something went wrong', error });
  }
};

module.exports = {
  createReview,
  getProductReviews,
};
