// app.js
const express = require("express");
require("dotenv").config();
require("./db");

const path = require("path");
const cors = require("cors");
const cloudinary = require("cloudinary").v2;

const AppError = require("./utils/appError");
const globalErrorHandler = require("./controllers/errorController");

const app = express();

// --- CORS ---
const allowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  process.env.FRONTEND_URL, // например: https://your-domain.com
].filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // Postman/SSR
    if (allowedOrigins.includes(origin)) return cb(null, true);

    // Разрешим локальную сеть вида http://192.168.x.x:5173 или http://10.x.x.x:5173 (Vite dev-server)
    const isLocalNet =
      /^http:\/\/192\.168\.\d+\.\d+:5173$/.test(origin) ||
      /^http:\/\/10\.\d+\.\d+\.\d+:5173$/.test(origin);
    if (isLocalNet) return cb(null, true);

    return cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept-Language", "X-Requested-With"],
  exposedHeaders: ["Set-Cookie"],
  optionsSuccessStatus: 204,
};

// CORS для всех методов (включая OPTIONS)
app.use(cors(corsOptions));
// ❗ ВАЖНО: preflight через РЕГЭКСП (совместимо с express@5)
// (убрали app.options("*", ...) и app.options("/api/*", ...))
app.options(/.*/, cors(corsOptions));

app.set("trust proxy", 1);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/images", express.static(path.join(__dirname, "public", "images")));

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "diw6ugcy3",
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.get("/", (_req, res) => {
  res.status(200).json({ status: "ok", service: "my-app-backend" });
});

// ===== ROUTES =====
const uploadRoutes = require("./api/uploadRoutes");
const userAPIRoutes = require("./api/usersRoutes");
const productsAPIRoutes = require("./api/productRoutes");
const categoriesAPIRoutes = require("./api/categoryRoutes");
const subcategoryAPIRoutes = require("./api/subcategoryRoutes");
const favoriteAPIRoutes = require("./api/favoriteRoutes");
const ordersAPIRoutes = require("./api/orderRoutes");   // user-facing (/api/orders)
const adminAPIRoutes = require("./api/adminRoutes");    // admin-only  (/api/admin/**)
const reviewAPIRoutes = require("./api/reviewRoutes");
const aboutRoutes = require("./api/aboutRoutes");

app.use("/api", uploadRoutes);
app.use("/api/users", userAPIRoutes);
app.use("/api/products", productsAPIRoutes);
app.use("/api/categories", categoriesAPIRoutes);
app.use("/api/subcategories", subcategoryAPIRoutes);
app.use("/api/favorites", favoriteAPIRoutes);
app.use("/api/orders", ordersAPIRoutes);  // checkout, мои заказы и т.п.
app.use("/api/admin", adminAPIRoutes);    // здесь /orders и /orders/:id
app.use("/api/reviews", reviewAPIRoutes);
app.use("/api/about", aboutRoutes);

// 404
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global error
app.use((err, req, res, next) => {
  console.error("Global error handler:", err);
  if (globalErrorHandler) return globalErrorHandler(err, req, res, next);
  res.status(err.statusCode || 500).json({
    status: "error",
    message: err.message || "Internal Server Error",
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}.`));

