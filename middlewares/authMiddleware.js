// middlewares/authMiddleware.js
const jwt = require("jsonwebtoken");

module.exports = function authMiddleware(req, res, next) {
  try {
    const authHeader = req.header("Authorization") || req.header("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Access denied. No token provided" });
    }

    const token = authHeader.slice(7).trim();

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    if (!decoded || typeof decoded !== "object" || !decoded.id) {
      return res.status(400).json({ message: "Invalid token structure" });
    }

    // Нормализация полей — чтобы downstream-код работал стабильно
    const role =
      typeof decoded.role === "string"
        ? decoded.role
        : decoded.isAdmin
        ? "admin"
        : "";
    const isAdmin = !!decoded.isAdmin;

    req.user = {
      ...decoded,
      _id: decoded.id, // многие места ожидают _id
      role,
      isAdmin,
    };

    return next();
  } catch (err) {
    console.error("authMiddleware error:", err);
    return res.status(500).json({ message: "Auth error" });
  }
};
