const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const {
  createReview,
  getProductReviews
} = require('../controllers/reviewController');


router.post('/:id/reviews', authMiddleware, createReview);
router.get('/:id/reviews', getProductReviews);

module.exports = router;
