const express = require("express");
require("dotenv").config();
require("./db");

const AppError = require("./utils/appError");
const globalErrorHandler = require("./controllers/errorController");
const cloudinary = require("cloudinary").v2;
const cors = require("cors");

const app = express();

/* ----------------- CORS (ставим РАНО) ----------------- */
const allowedOrigins = [
  "http://localhost:5173",
  // добавь продовый фронт, если есть:
  // "https://your-frontend-domain.com"
];

app.use(
  cors({
    origin(origin, cb) {
      // Разрешаем запросы без Origin (Postman / сервер->сервер)
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Type", "Authorization"],
  })
);


/* ----------------- Парсеры ----------------- */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ----------------- Cloudinary ----------------- */
cloudinary.config({
  cloud_name: "diw6ugcy3",
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ----------------- Health-check / root (ДОЛЖЕН быть до 404) ----------------- */
app.get("/", (req, res) => {
  // не используем res.render без view engine
  res.status(200).json({ status: "ok", service: "my-app-backend" });
});

/* ----------------- Роуты API ----------------- */
const uploadRoutes = require("./api/uploadRoutes");
const userAPIRoutes = require("./api/usersRoutes");
const productsAPIRoutes = require("./api/productRoutes");
const categoriesAPIRoutes = require("./api/categoryRoutes");
const subcategoryAPIRoutes = require("./api/subcategoryRoutes");
const favoriteAPIRoutes = require("./api/favoriteRoutes");
const ordersAPIRoutes = require("./api/orderRoutes");
const adminAPIRoutes = require("./api/adminRoutes");
const reviewAPIRoutes = require("./api/reviewRoutes");

app.use("/api", uploadRoutes);
app.use("/api/users", userAPIRoutes);
app.use("/api/products", productsAPIRoutes);
app.use("/api/categories", categoriesAPIRoutes);
app.use("/api/subcategories", subcategoryAPIRoutes);
app.use("/api/favorites", favoriteAPIRoutes);
app.use("/api/orders", ordersAPIRoutes);
app.use("/api/admin", adminAPIRoutes);
app.use("/api/reviews", reviewAPIRoutes);

/* ----------------- 404 (после всех роутов) ----------------- */
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

/* ----------------- Глобальный обработчик ошибок (самый последний) ----------------- */
app.use((err, req, res, next) => {
  console.error("Global error handler:", err);

  if (globalErrorHandler) {
    return globalErrorHandler(err, req, res, next);
  }

  res.status(err.statusCode || 500).json({
    status: "error",
    message: err.message || "Internal Server Error",
  });
});

/* ----------------- Старт ----------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}.`));
