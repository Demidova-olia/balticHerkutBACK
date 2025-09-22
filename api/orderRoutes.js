// api/orderRoutes.js
const express = require("express");
const rateLimit = require("express-rate-limit");

const {
  getOrders,
  getOrderById,
  createOrder,
  deleteOrder,
  getUserOrders,
  checkout,
  updateOrder,
} = require("../controllers/orderController");

const { sendOrderEmail } = require("../controllers/orderEmailController");

const authMiddleware = require("../middlewares/authMiddleware");
const rolesMiddleware = require("../middlewares/rolesMiddleware");
const ROLES = require("../config/roles");

const router = express.Router();

/* ========== helpers ========== */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);


const validateOrderEmail = (req, res, next) => {
  const b = req.body || {};
  const order = b.order || {};
  const customer = b.customer || {};

  if (!customer || !customer.name || !customer.email) {
    return res.status(400).json({ message: "Name and email are required" });
  }
  if (!order.items || !Array.isArray(order.items) || order.items.length === 0) {
    return res.status(400).json({ message: "Order items are required" });
  }

  for (const it of order.items) {
    const q = Number(it?.quantity);
    const p = Number(it?.price);
    if (!Number.isFinite(q) || q <= 0) {
      return res.status(400).json({ message: "Invalid item quantity" });
    }
    if (!Number.isFinite(p) || p < 0) {
      return res.status(400).json({ message: "Invalid item price" });
    }
  }
  if (!Number.isFinite(Number(order.total))) {
    return res.status(400).json({ message: "Invalid total" });
  }
  next();
};

const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 10,                  
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later." },
});

const requireEmailKey = (req, res, next) => {
  const expected = process.env.ORDER_EMAIL_KEY;
  if (!expected) return next(); 
  const got = req.get("x-order-email-key");
  if (got && got === expected) return next();
  return res.status(401).json({ message: "Unauthorized" });
};

router.post(
  "/email",
  emailLimiter,
  requireEmailKey,     
  validateOrderEmail,
  asyncHandler(sendOrderEmail)
);

if (process.env.NODE_ENV !== "production") {
  router.get("/email/test", (req, res, next) => {
    req.body = {
      order: { items: [{ name: "Test item", price: 3.5, quantity: 2 }], total: 7.0 },
      customer: { name: "Tester", email: "tester@example.com" },
      subject: "Тестовый заказ",
    };
    return sendOrderEmail(req, res, next);
  });
}


router.get("/", authMiddleware, rolesMiddleware(ROLES.ADMIN), getOrders);

router.get(
  "/user/:userId",
  authMiddleware,
  rolesMiddleware(ROLES.USER),
  getUserOrders
);

router.get("/:id", authMiddleware, getOrderById);

router.post("/checkout", authMiddleware, checkout);

router.post("/", authMiddleware, createOrder);

router.put("/:id", authMiddleware, rolesMiddleware(ROLES.ADMIN), updateOrder);

router.delete("/:id", authMiddleware, deleteOrder);

module.exports = router;
