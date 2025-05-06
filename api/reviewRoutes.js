const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const {
  createReview,
  updateReview,
  deleteReview,
  getProductReviews,
  getOneReview
} = require('../controllers/reviewController');

router.get('/:id/reviews', getProductReviews);

router.get('/reviews/:reviewId', getOneReview);

router.post('/:id/reviews', authMiddleware, createReview);

router.put('/reviews/:reviewId', authMiddleware, updateReview);

router.delete('/reviews/:reviewId', authMiddleware, deleteReview);

module.exports = router;
