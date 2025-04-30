const express = require("express");
const { getStats, getAllOrders, updateOrderStatus } = require("../controllers/adminController");
const authMiddleware = require("../middlewares/authMiddleware");
const rolesMiddleware = require("../middlewares/rolesMiddleware");
const ROLES = require("../config/roles");

const router = express.Router();

router.get("/stats", authMiddleware, rolesMiddleware(ROLES.ADMIN), getStats);
router.put("/orders/:orderId", authMiddleware, rolesMiddleware(ROLES.ADMIN), updateOrderStatus);
router.get("/orders", authMiddleware, getAllOrders);

module.exports = router;