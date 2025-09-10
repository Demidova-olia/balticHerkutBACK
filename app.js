const express = require("express");
require("dotenv").config();
require("./db");

const AppError = require("./utils/appError");
const globalErrorHandler = require("./controllers/errorController");
const cloudinary = require("cloudinary").v2;
const cors = require("cors");

const app = express();

const allowedOrigins = [
  "http://localhost:5173",
 
];

const corsOptions = {
  origin(origin, cb) {

    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "Accept-Language",
    "X-Requested-With",
    // "X-Client-Lang",
  ],
  exposedHeaders: ["Set-Cookie"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));


/* ----------------- Body parsers ----------------- */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ----------------- Cloudinary ----------------- */
cloudinary.config({
  cloud_name: "diw6ugcy3",
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});


app.get("/", (req, res) => {
  res.status(200).json({ status: "ok", service: "my-app-backend" });
});

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

app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}.`));
