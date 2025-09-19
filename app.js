// app.js
const express = require("express");
require("dotenv").config();
require("./db");

const path = require("path");
const cookieParser = require("cookie-parser"); // for reading cookies if you set JWT as cookie
const cloudinary = require("cloudinary").v2;

const AppError = require("./utils/appError");
const globalErrorHandler = require("./controllers/errorController");

const app = express();

/* ==================== CORS (robust) ==================== */
const DEFAULT_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
const DEFAULT_HEADERS =
  "Origin,X-Requested-With,Content-Type,Accept,Authorization,Accept-Language";
const EXPOSE_HEADERS = "Set-Cookie";

// exact origins allowed (env + local)
const RAW_ALLOW = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  process.env.FRONTEND_URL, // e.g. https://your-frontend.app
].filter(Boolean);

const normalizeOrigin = (s) => String(s || "").replace(/\/$/, "").toLowerCase();
const EXACT_ALLOW = RAW_ALLOW.map(normalizeOrigin);

// local network (vite on 5173)
const LOCAL_REGEX = [
  /^http:\/\/192\.168\.\d+\.\d+:5173$/i,
  /^http:\/\/10\.\d+\.\d+\.\d+:5173$/i,
];

function isAllowedOrigin(origin) {
  if (!origin) return true; // Postman/SSR/etc.
  const norm = normalizeOrigin(origin);
  if (EXACT_ALLOW.includes(norm)) return true;
  return LOCAL_REGEX.some((re) => re.test(origin));
}

app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  const allowed = isAllowedOrigin(origin);

  // Always vary by origin to avoid cache poisoning
  res.setHeader("Vary", "Origin");

  if (allowed && origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");

    // echo requested methods/headers (safest)
    const reqMethod = req.headers["access-control-request-method"];
    const reqHeaders = req.headers["access-control-request-headers"];

    res.setHeader("Access-Control-Allow-Methods", reqMethod || DEFAULT_METHODS);
    res.setHeader("Access-Control-Allow-Headers", reqHeaders || DEFAULT_HEADERS);
    res.setHeader("Access-Control-Expose-Headers", EXPOSE_HEADERS);

    // cache preflight to reduce OPTIONS noise
    res.setHeader("Access-Control-Max-Age", "86400"); // 24h
  }

  // Preflight fast-path (return headers above if allowed)
  if (req.method === "OPTIONS") {
    // Some proxies drop headers on 204; 204 is fine, but 200 is safer for certain CDNs.
    return res.status(allowed ? 200 : 403).end();
  }

  // Block real requests from disallowed origins
  if (!allowed && origin) {
    return res.status(403).json({ message: "Not allowed by CORS" });
  }

  next();
});
/* ==================== /CORS ==================== */

app.set("trust proxy", 1);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser()); // safe to have even if you don’t use cookies yet

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
const adminAPIRoutes = require("./api/adminRoutes");  // admin-only (/api/admin/**)
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
