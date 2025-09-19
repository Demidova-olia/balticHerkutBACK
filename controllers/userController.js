const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/userModel");
const Order = require("../models/orderModel");
const Review = require("../models/reviewModel");
const Favorite = require("../models/favoriteModel");
const process = require("process");

/* ===== helpers: issue token + set cookie + safe user shape ===== */
function makeToken(user) {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      username: user.username,
      role: user.role,
      isAdmin: !!user.isAdmin,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" } // можно вернуть 1h, если тебе нужно строго час
  );
}

function setAuthCookie(res, token) {
  // Cookie для кросс-доменных запросов (localhost:5173 -> onrender.com) —
  // нужен SameSite=None и Secure
  res.cookie("jwt", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function publicUser(u) {
  return {
    id: u._id,
    _id: u._id,            // чтобы не ломать места, где ожидают _id
    username: u.username,
    email: u.email,
    role: u.role,
    isAdmin: !!u.isAdmin,
    phoneNumber: u.phoneNumber,
    profilePicture: u.profilePicture,
    address: u.address,
  };
}

/* =========================================================
 * REGISTER
 * =======================================================*/
const register = async (req, res) => {
  const { username, email, password, phoneNumber } = req.body;

  if (!username || !email || !password) {
    return res.status(400).send({ message: "All fields are required" });
  }

  const normEmail = String(email).toLowerCase().trim();

  const existingUser = await User.findOne({ email: normEmail });
  if (existingUser) {
    return res.status(400).send({ message: "Email already exists" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      username,
      email: normEmail,
      phoneNumber,
      password: hashedPassword,
    });
    await newUser.save();

    const token = makeToken(newUser);
    setAuthCookie(res, token);

    res.send({
      message: "User registered successfully.",
      token,            // дублируем токен в JSON — фронт положит в Authorization (fallback)
      user: publicUser(newUser),
    });
  } catch (error) {
    console.error("[register] error:", error);
    res.status(500).send({ message: "Server error", error });
  }
};

/* =========================================================
 * LOGIN
 * =======================================================*/
const login = async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).send({ message: "Invalid email or password" });
  }

  try {
    const normEmail = String(email).toLowerCase().trim();

    // если password в модели со select:false — +password обеспечит доступ
    const user = await User.findOne({ email: normEmail }).select("+password");
    if (!user) {
      return res.status(400).send({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).send({ message: "Invalid email or password" });
    }

    const token = makeToken(user);
    setAuthCookie(res, token);

    // Возвращаем и token, и user (чтобы фронт мог выставить Authorization)
    res.send({ message: "Login successful", token, user: publicUser(user) });
  } catch (error) {
    console.error("[login] error:", error);
    res.status(500).send({ message: "Server error", error });
  }
};

/* =========================================================
 * USERS LIST (admin)
 * =======================================================*/
const getUsers = async (req, res) => {
  try {
    const users = await User.find();
    res.send(users);
  } catch (error) {
    res.status(500).send(error);
  }
};

/* =========================================================
 * DELETE USER (self or admin)
 * =======================================================*/
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user.id || req.user._id?.toString();
    const isAdmin = req.user.role === "ADMIN" || req.user.isAdmin === true;

    if (!isAdmin && id !== currentUserId) {
      return res.status(403).send({ error: "Access denied" });
    }

    const deletedUser = await User.findByIdAndDelete(id);
    if (!deletedUser) {
      return res.status(404).send({ error: "User not found" });
    }

    res.send({ message: "User deleted", data: deletedUser });
  } catch (error) {
    res.status(500).send(error);
  }
};

/* =========================================================
 * MY ORDERS
 * =======================================================*/
const getMyOrders = async (req, res) => {
  try {
    const userId = req.user._id;
    const orders = await Order.find({ user: userId }).populate(
      "items.productId",
      "name price images"
    );
    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ message: "Failed to retrieve orders", error });
  }
};

/* =========================================================
 * PROFILE
 * =======================================================*/
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id || req.user._id).select("-password");
    if (!user) return res.status(404).send({ message: "User not found" });

    res.status(200).send(publicUser(user));
  } catch (err) {
    res.status(500).send({ message: "Server error", error: err });
  }
};

/* =========================================================
 * UPDATE PROFILE
 * =======================================================*/
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const { username, email, phoneNumber, profilePicture, address } = req.body;

    const updates = {
      ...(username && { username }),
      ...(email && { email: String(email).toLowerCase().trim() }),
      ...(phoneNumber && { phoneNumber }),
      ...(profilePicture && { profilePicture }),
      ...(address && { address }),
    };

    if ("role" in req.body) {
      delete req.body.role;
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updates, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      message: "Profile updated successfully",
      user: publicUser(updatedUser),
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to update profile", error });
  }
};

/* =========================================================
 * FAVORITES / REVIEWS
 * =======================================================*/
const getMyFavorites = async (req, res) => {
  try {
    const favorites = await Favorite.find({ user: req.user._id }).populate("product");
    res.status(200).json(favorites);
  } catch (err) {
    res.status(500).json({ message: "Error retrieving favorites", error: err.message });
  }
};

const getMyReviews = async (req, res) => {
  try {
    const reviews = await Review.find({ userId: req.user._id }).populate("productId", "name");
    res.status(200).json(reviews);
  } catch (err) {
    res.status(500).json({ message: "Error retrieving reviews", error: err.message });
  }
};

module.exports = {
  register,
  login,
  getUsers,
  deleteUser,
  getMyOrders,
  getProfile,
  getMyFavorites,
  getMyReviews,
  updateProfile,
};
