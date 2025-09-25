// app.js
const express = require("express");
require("dotenv").config();
require("./db");

const path = require("path");
const cloudinary = require("cloudinary").v2;

const AppError = require("./utils/appError");
const globalErrorHandler = require("./controllers/errorController");

const app = express();

/* ==================== CORS (robust) ==================== */
const DEFAULT_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";

const DEFAULT_HEADERS =
  "Origin,X-Requested-With,Content-Type,Accept,Authorization,Accept-Language,X-Order-Email-Key";
const EXPOSE_HEADERS = "Set-Cookie";

const normalizeOrigin = (s) => String(s || "").replace(/\/$/, "").toLowerCase();

const RAW_ALLOW = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  process.env.FRONTEND_URL,
  ...(process.env.ALLOW_ORIGINS
    ? process.env.ALLOW_ORIGINS.split(",").map((s) => s.trim())
    : []),
].filter(Boolean);

const EXACT_ALLOW = RAW_ALLOW.map(normalizeOrigin);

const LOCAL_REGEX = [
  /^http:\/\/192\.168\.\d+\.\d+:5173$/i,
  /^http:\/\/10\.\d+\.\d+\.\d+:5173$/i,
];

function isAllowedOrigin(origin) {
  if (!origin) return true; // Postman/SSR/health-check
  const norm = normalizeOrigin(origin);
  if (EXACT_ALLOW.includes(norm)) return true;
  return LOCAL_REGEX.some((re) => re.test(origin));
}

app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  const allowed = isAllowedOrigin(origin);

  res.setHeader("Vary", "Origin");

  if (allowed && origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");

    const reqMethod = req.headers["access-control-request-method"];
    const reqHeaders = req.headers["access-control-request-headers"];

    res.setHeader("Access-Control-Allow-Methods", reqMethod || DEFAULT_METHODS);
    res.setHeader("Access-Control-Allow-Headers", reqHeaders || DEFAULT_HEADERS);
    res.setHeader("Access-Control-Expose-Headers", EXPOSE_HEADERS);
    res.setHeader("Access-Control-Max-Age", "86400"); // preflight cache 24h
  }

  if (req.method === "OPTIONS") {
    return res.status(allowed ? 204 : 403).end();
  }

  if (!allowed && origin) {
    return res.status(403).json({ message: "Not allowed by CORS" });
  }

  next();
});
/* ==================== /CORS ==================== */

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
const ordersAPIRoutes = require("./api/orderRoutes"); // user-facing (/api/orders)
const adminAPIRoutes = require("./api/adminRoutes"); // admin-only (/api/admin/**)
const reviewAPIRoutes = require("./api/reviewRoutes");
const aboutRoutes = require("./api/aboutRoutes");

app.use("/api", uploadRoutes);
app.use("/api/users", userAPIRoutes);
app.use("/api/products", productsAPIRoutes);
app.use("/api/categories", categoriesAPIRoutes);
app.use("/api/subcategories", subcategoryAPIRoutes);
app.use("/api/favorites", favoriteAPIRoutes);
app.use("/api/orders", ordersAPIRoutes);
app.use("/api/admin", adminAPIRoutes);
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
