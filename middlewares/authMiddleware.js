const process = require("process");
const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  // Get token from Authorization header (Bearer token)
  const token = req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ message: "Access denied. No token provided" });
  }

  try {
    // Verify token and decode it
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Ensure the token contains the correct user data (usually the user's ID or _id)
    if (!decoded || !decoded.id) {
      return res.status(400).json({ message: "Invalid token structure" });
    }

    // Attach user data to request object for further use in the controller
    req.user = { ...decoded, _id: decoded.id };

    // Proceed to the next middleware or route handler
    next();
  } catch (error) {
    // Detailed error message for debugging purposes
    console.error("Error verifying token:", error.message);
    return res.status(400).json({ message: "Invalid token", error: error.message });
  }
};

module.exports = authMiddleware;
