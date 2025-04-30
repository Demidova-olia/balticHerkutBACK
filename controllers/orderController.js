const Order = require("../models/orderModel");
const User = require("../models/userModel");
const { ALLOWED_ORDER_STATUSES } = require("../constants/orderStatus");

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

const getOrders = async (req, res) => {
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
  const { user } = req.params;

  try {
    if (req.user.id !== user) {
      return res
        .status(403)
        .send({
          message: "Access denied. You cannot view other users' orders.",
        });
    }
    const foundUser = await User.findById(user).populate("orders");

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

const updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; 

    if (status && !ALLOWED_ORDER_STATUSES.includes(status)) {
      return res.status(400).send({ error: "Invalid order status" });
    } 

    const updated = await Order.findOneAndUpdate(
      { _id: id },
      { $set: req.body },
      { new: true }
    );
    if (!updated) {
      return res.status(404).send({ message: "Order not found" });
    }
    res.status(200).send(updated);
  } catch (error) {
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
