const Order = require("../models/orderModel");
const Product = require("../models/productModel");
const { ALLOWED_ORDER_STATUSES } = require("../constants/orderStatus");
const { Types } = require("mongoose");

function isAdmin(user) {
  const role = String(user?.role || "").toUpperCase();
  return Boolean(user?.isAdmin || role === "ADMIN");
}

function toObjectId(id) {
  try { return new Types.ObjectId(id); } catch { return null; }
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
  const dbg = [];
  for (const it of items || []) {
    const pidStr = getProductIdFromItem(it);
    const _id = toObjectId(pidStr);
    const qty = Number(it?.quantity || 0);
    if (!_id || !qty) continue;

    ops.push({
      updateOne: {
        filter: { _id },
        update: { $inc: { stock: sign * qty } }, // если поле названо иначе — замени 'stock'
      },
    });
    dbg.push({ pid: pidStr, _id: String(_id), qty, sign });
  }
  return { ops, dbg };
}

// ========== STATS ==========
exports.getStats = async (_req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const revenueAgg = await Order.aggregate([{ $group: { _id: null, totalAmount: { $sum: "$totalAmount" } } }]);
    const totalRevenue = revenueAgg.length ? revenueAgg[0].totalAmount : 0;
    res.status(200).json({ totalOrders, totalRevenue });
  } catch (error) {
    console.error("[admin:getStats] error:", error);
    res.status(500).json({ message: "Server error during stats retrieval", error });
  }
};

// ========== GET ALL ORDERS ==========
exports.getAllOrders = async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).send({ message: "Only ADMIN can see all orders" });

    const orders = await Order.find()
      .populate("user", "email username")
      .populate("items.productId", "name price image");

    res.send(orders);
  } catch (error) {
    console.error("[admin:getAllOrders] error:", error);
    res.status(500).send({ message: "Failed to retrieve orders", error });
  }
};

// ========== UPDATE ORDER STATUS ==========
exports.updateOrderStatus = async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).send({ message: "Only ADMIN can update orders" });

    const orderId = req.params.id || req.params.orderId;
    const nextStatus = String(req.body?.status || "").toLowerCase();

    if (!orderId) return res.status(400).json({ message: "orderId is required" });
    if (!nextStatus || !ALLOWED_ORDER_STATUSES.includes(nextStatus)) {
      return res.status(400).json({ message: "Invalid order status" });
    }

    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });

    const prevStatus = String(order.status || "").toLowerCase();
    if (prevStatus === nextStatus) {
      const same = await Order.findById(orderId)
        .populate("user", "email username")
        .populate("items.productId", "name price image");
      return res.status(200).json(same);
    }

    const delta = (nextStatus === "canceled" ? 1 : 0) - (prevStatus === "canceled" ? 1 : 0);

    console.log("[admin:updateOrderStatus] order:", {
      orderId,
      prevStatus,
      nextStatus,
      delta,
    });

    if (delta !== 0) {
      const { ops, dbg } = buildStockOps(order.items, delta);
      console.log("[admin:updateOrderStatus] stock ops:", dbg);

      if (ops.length) {
        try {
          const bulkRes = await Product.bulkWrite(ops, { ordered: false });
          const matched = bulkRes.matchedCount ?? bulkRes.result?.nMatched ?? 0;
          const modified = bulkRes.modifiedCount ?? bulkRes.result?.nModified ?? 0;
          const upserts = bulkRes.upsertedCount ?? bulkRes.result?.nUpserted ?? 0;
          console.log("[admin:updateOrderStatus] stock bulk result:", { matched, modified, upserts });
        } catch (e) {
          console.error("[admin:updateOrderStatus] bulkWrite error:", e?.message || e);
          return res.status(500).json({ message: "Stock update failed", error: e?.message || e });
        }
      } else {
        console.warn("[admin:updateOrderStatus] no stock ops built");
      }
    } else {
      console.log("[admin:updateOrderStatus] no stock change needed for this transition");
    }

    order.status = nextStatus;
    await order.save();

    const updated = await Order.findById(orderId)
      .populate("user", "email username")
      .populate("items.productId", "name price image");

    return res.status(200).json(updated);
  } catch (error) {
    console.error("[admin:updateOrderStatus] error:", error);
    return res.status(500).json({ message: "Server error updating order status", error });
  }
};
