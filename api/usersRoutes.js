const express = require("express");
const {
  register,
  login,
  getUsers,
  deleteUser,
  getMyOrders,
  getProfile,
  updateProfile,
  getMyFavorites,
  getMyReviews,
} = require("../controllers/userController");
const authMiddleware = require("../middlewares/authMiddleware");
const rolesMiddleware = require("../middlewares/rolesMiddleware");
const ROLES = require("../config/roles");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);

router.get("/orders", authMiddleware, getMyOrders);
router.get('/profile', authMiddleware, getProfile);
router.put("/profile", authMiddleware, updateProfile);
router.get("/favorites", authMiddleware, getMyFavorites);
router.get("/reviews", authMiddleware, getMyReviews);

router.get("/", authMiddleware, rolesMiddleware(ROLES.ADMIN), getUsers);
router.delete("/:id", authMiddleware, rolesMiddleware(ROLES.ADMIN), deleteUser);

module.exports = router;