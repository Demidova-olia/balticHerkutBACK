const express = require("express");
const {
  getStats,
  getAllOrders,
  updateOrderStatus,
} = require("../controllers/adminController");
const authMiddleware = require("../middlewares/authMiddleware");
const rolesMiddleware = require("../middlewares/rolesMiddleware");
const ROLES = require("../config/roles");

const router = express.Router();

// Всё под /api/admin — только для админа
router.get("/stats",  authMiddleware, rolesMiddleware(ROLES.ADMIN), getStats);
router.get("/orders", authMiddleware, rolesMiddleware(ROLES.ADMIN), getAllOrders);

// ВАЖНО: ':id' ИСПОЛЬЗУЕМ ВЕЗДЕ ОДИНАКОВО
router.put("/orders/:id", authMiddleware, rolesMiddleware(ROLES.ADMIN), updateOrderStatus);

module.exports = router;
