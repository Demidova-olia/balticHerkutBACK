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

router.get('/review/:reviewId', getOneReview);

router.post('/:id/reviews', authMiddleware, createReview);

router.put('/review/:reviewId', authMiddleware, updateReview);

router.delete('/review/:reviewId', authMiddleware, deleteReview);

module.exports = router;
