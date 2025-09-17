const mongoose = require("mongoose");
const Order = require("../models/orderModel");
const User = require("../models/userModel");
const Product = require("../models/productModel");
const { ALLOWED_ORDER_STATUSES } = require("../constants/orderStatus");

/** ===== Helpers ===== */
const STATUS_ALIASES = {
  canceled: "canceled",
  cancelled: "canceled",
  cancel: "canceled",
  canceld: "canceled",
  "отменен": "canceled",
  "отменён": "canceled",
};

function toObjectId(id) {
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
}

function getProductIdFromItem(item) {
  const candidates = [item?.productId, item?.product, item?._id];
  for (const c of candidates) {
    if (!c) continue;
    if (typeof c === "string") return c;
    if (typeof c === "object") {
      if (c._id) return String(c._id);
      if (typeof c.toString === "function") return c.toString();
    }
  }
  return null;
}

function buildStockOps(items, sign) {
  const ops = [];
  for (const it of items || []) {
    const pidStr = getProductIdFromItem(it);
    const qty = Number(it?.quantity || 0);
    if (!pidStr || !qty) continue;

    const oid = toObjectId(pidStr);
    if (!oid) continue;

    ops.push({
      updateOne: {
        filter: { _id: oid },
        update: { $inc: { stock: sign * qty } },
      },
    });
  }
  return ops;
}

/** ===== Controllers ===== */

const createOrder = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).send({ message: "Access denied. Please login" });
    }

    const userId = req.user._id;
    const { items, address } = req.body;

    if (!items || !address) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const newOrder = new Order({
      user: userId,
      items,
      address,
    });
    await newOrder.save();
    res.send(newOrder);
  } catch (error) {
    res.status(500).send({ message: "Something went wrong with order", error });
  }
};

const getOrders = async (_req, res) => {
  try {
    const orders = await Order.find()
      .populate("user", "username email")
      .populate("items.productId", "name price image");
    res.send(orders);
  } catch (error) {
    res.status(500).send(error);
  }
};

const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id)
      .populate("user", "username email")
      .populate("items.productId", "name price image");
    if (!order) {
      return res.status(404).send({ error: "Order Not found" });
    }
    res.send(order);
  } catch (error) {
    res.status(500).send(error);
  }
};

const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedOrder = await Order.findByIdAndDelete(id);

    if (!deletedOrder) {
      return res.status(404).send({ error: "Order Not found" });
    }
    res.send({ message: "Order was removed", data: deletedOrder });
  } catch (error) {
    res.status(500).send(error);
  }
};

const getUserOrders = async (req, res) => {
  // роут у тебя /orders/user/:userId — значит нужно брать userId
  const { userId } = req.params;

  try {
    if (String(req.user.id) !== String(userId)) {
      return res
        .status(403)
        .send({ message: "Access denied. You cannot view other users' orders." });
    }
    const foundUser = await User.findById(userId).populate("orders");

    if (!foundUser) {
      return res.status(404).send({ message: "User not found" });
    }

    res.send(foundUser.orders);
  } catch (error) {
    res.status(500).send(error);
  }
};

const checkout = async (req, res) => {
  try {
    const userId = req.user._id;
    const { cart, address, totalAmount } = req.body;

    if (!cart || cart.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    let calculatedTotal = 0;
    cart.forEach((item) => {
      calculatedTotal += item.price * item.quantity;
    });

    if (totalAmount && calculatedTotal !== totalAmount) {
      return res.status(400).json({ error: "Total amount mismatch" });
    }

    const order = new Order({
      user: userId,
      items: cart,
      totalAmount: totalAmount || calculatedTotal,
      price: totalAmount || calculatedTotal,
      address,
      orderDate: new Date(),
      status: "pending",
    });

    const saveOrder = await order.save();

    res.status(201).send({ message: "Order received", orderId: saveOrder._id });
  } catch (error) {
    res.status(500).json({ error: "Failed to create order" });
  }
};

/**
 * ВАЖНО: теперь этот метод тоже корректно возвращает товар на склад,
 * если статус меняется в/из 'canceled'.
 */
const updateOrder = async (req, res) => {
  try {
    const { id } = req.params;

    // нормализуем статус (страховка от опечаток/локализаций)
    let nextStatus = req.body?.status;
    if (typeof nextStatus === "string") {
      nextStatus = STATUS_ALIASES[nextStatus.toLowerCase().trim()] || nextStatus.toLowerCase().trim();
    }

    if (nextStatus && !ALLOWED_ORDER_STATUSES.includes(nextStatus)) {
      return res.status(400).send({ error: "Invalid order status" });
    }

    // берём текущий заказ
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).send({ message: "Order not found" });
    }

    const prevStatus = order.status;
    const bodyHasItems = Array.isArray(req.body?.items);

    // Если меняется только статус — обрабатываем переход в/из canceled
    if (nextStatus && !bodyHasItems) {
      const delta =
        (nextStatus === "canceled" ? 1 : 0) - (prevStatus === "canceled" ? 1 : 0);

      if (delta !== 0) {
        const ops = buildStockOps(order.items, delta);
        if (ops.length) {
          const bulkRes = await Product.bulkWrite(ops);
          console.log("[orders:updateOrder] stock bulk", {
            matched: bulkRes.matchedCount,
            modified: bulkRes.modifiedCount,
          });
        } else {
          console.warn("[orders:updateOrder] no stock ops built");
        }
      }
    }

    // Обновляем поля. Если прилетели items — твой pre('findOneAndUpdate') уже пересчитает total и сток.
    const update = { $set: { ...req.body } };
    if (nextStatus) update.$set.status = nextStatus;

    const updated = await Order.findOneAndUpdate({ _id: id }, update, { new: true })
      .populate("user", "username email")
      .populate("items.productId", "name price image");

    if (!updated) {
      return res.status(404).send({ message: "Order not found" });
    }

    res.status(200).send(updated);
  } catch (error) {
    console.error("[orders:updateOrder] error:", error);
    res.status(500).send({ message: "Failed to update order", error });
  }
};

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  deleteOrder,
  getUserOrders,
  checkout,
  updateOrder,
};
