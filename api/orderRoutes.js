const express = require("express");
const {
  getOrders,
  getOrderById,
  createOrder,
  deleteOrder,
  getUserOrders,
  checkout,
  updateOrder,
} = require("../controllers/orderController");
const authMiddleware = require("../middlewares/authMiddleware");
const rolesMiddleware = require("../middlewares/rolesMiddleware");
const ROLES = require("../config/roles");

const router = express.Router();

router.get(
  "/",
  authMiddleware,
  rolesMiddleware(ROLES.ADMIN, ROLES.USER),
  getOrders
);
router.get(
  "/user/:userId",
  authMiddleware,
  rolesMiddleware(ROLES.USER),
  getUserOrders
);
router.get("/:id", authMiddleware, getOrderById);
router.post("/", authMiddleware, createOrder);
router.put("/:id", authMiddleware, rolesMiddleware(ROLES.ADMIN), updateOrder);
router.delete("/:id", authMiddleware, deleteOrder);
router.post("/checkout", authMiddleware, checkout);
router.get("/user/:userId", authMiddleware, rolesMiddleware(ROLES.USER), getUserOrders);

module.exports = router;
