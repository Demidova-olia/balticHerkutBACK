const express = require("express");
const {
  addFavorite,
  removeFavorite,
  getFavorites,
} = require("../controllers/favoriteController");

const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");

router.use(authMiddleware); 

router.post("/", addFavorite);             
router.delete("/:productId", removeFavorite);  
router.get("/", getFavorites);                  

module.exports = router;
