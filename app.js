require("dotenv").config();

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION! Shutting down...", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION!", reason);
});

const express = require("express");
const path = require("path");
const cloudinary = require("cloudinary").v2;
require("./db");

try {
  require("./jobs/erplyPriceStock.cron");
  console.log("[cron] erplyPriceStock job loaded");
} catch (e) {
  console.warn("[cron] not loaded:", e?.message || e);
}

const AppError = require("./utils/appError");
const globalErrorHandler = require("./controllers/errorController");

const app = express();

/* ---------------------- CORS ---------------------- */
const DEFAULT_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
const DEFAULT_HEADERS =
  "Origin,X-Requested-With,Content-Type,Accept,Authorization,Accept-Language";
const EXPOSE_HEADERS = "Set-Cookie";

const ALLOW_ORIGINS = String(process.env.ALLOW_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const normalize = (s) => String(s || "").replace(/\/$/, "").toLowerCase();
const ALLOW_SET = new Set(ALLOW_ORIGINS.map(normalize));
const ALLOW_REGEX = process.env.ALLOW_REGEX
  ? new RegExp(process.env.ALLOW_REGEX, "i")
  : null;

const LOCAL_NET_5173 = [
  /^http:\/\/192\.168\.\d+\.\d+:5173$/i,
  /^http:\/\/10\.\d+\.\d+\.\d+:5173$/i,
];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  const n = normalize(origin);
  if (ALLOW_SET.has(n)) return true;
  if (ALLOW_REGEX && ALLOW_REGEX.test(origin)) return true;
  if (LOCAL_NET_5173.some((re) => re.test(origin))) return true;
  return false;
}

app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  const allowed = isAllowedOrigin(origin);
  res.setHeader("Vary", "Origin");

  if (allowed && origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Methods",
      req.headers["access-control-request-method"] || DEFAULT_METHODS
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      req.headers["access-control-request-headers"] || DEFAULT_HEADERS
    );
    res.setHeader("Access-Control-Expose-Headers", EXPOSE_HEADERS);
    res.setHeader("Access-Control-Max-Age", "86400");
  }

  if (req.method === "OPTIONS") {
    return res.status(allowed ? 204 : 403).end();
  }
  if (!allowed && origin) {
    return res.status(403).json({ message: "Not allowed by CORS", origin });
  }
  next();
});

/* ---------------------- Middleware ---------------------- */
app.set("trust proxy", 1);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.get("/favicon.ico", (_req, res) => res.status(204).end());

app.use("/images", express.static(path.join(__dirname, "public", "images")));

/* ---------------------- Cloudinary ---------------------- */
if (process.env.CLOUDINARY_URL) {
  cloudinary.config({ secure: true });
  console.log("[cloudinary] configured via CLOUDINARY_URL");
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "diw6ugcy3",
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  if (!process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.warn("[cloudinary] ⚠️ API credentials missing — uploads may fail.");
  } else {
    console.log("[cloudinary] configured via explicit keys");
  }
}

/* ---------------------- Health check ---------------------- */
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", uptime: process.uptime() });
});

app.get("/", (_req, res) => {
  res.status(200).json({ status: "ok", service: "my-app-backend" });
});

/* ---------------------- Routes ---------------------- */
const uploadRoutes = require("./api/uploadRoutes");
const userAPIRoutes = require("./api/usersRoutes");
const productsAPIRoutes = require("./api/productRoutes");
const categoriesAPIRoutes = require("./api/categoryRoutes");
const subcategoryAPIRoutes = require("./api/subcategoryRoutes");
const favoriteAPIRoutes = require("./api/favoriteRoutes");
const ordersAPIRoutes = require("./api/orderRoutes");
const adminAPIRoutes = require("./api/adminRoutes");
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

/* ---------------------- 404 + Global error ---------------------- */
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use((err, req, res, next) => {
  console.error("Global error handler:", err);
  if (globalErrorHandler) return globalErrorHandler(err, req, res, next);
  res.status(err.statusCode || 500).json({
    status: "error",
    message: err.message || "Internal Server Error",
  });
});

/* ---------------------- Start server ---------------------- */
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () =>
  console.log(
    `Server is running on port ${PORT} (NODE_ENV=${process.env.NODE_ENV || "dev"})`
  )
);

function shutdown(sig) {
  console.warn(`${sig} received. Shutting down gracefully...`);
  server.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });
  setTimeout(() => {
    console.error("Forcing shutdown after timeout.");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
