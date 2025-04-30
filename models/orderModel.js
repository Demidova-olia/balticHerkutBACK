const mongoose = require("mongoose");
const { ORDER_STATUS } = require("../constants/orderStatus");

const itemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "Product",
  },

  quantity: {
    type: Number,
    required: true,
  },

  price: {
    type: Number,
    required: true,
  },
});

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    items: [itemSchema],
    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.PENDING,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    totalAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    address: { 
      type: String,
      required: true, 
    },
  },
  { timestamps: true }
);

orderSchema.pre("save", async function (next) {
  if (this.isNew || this.isModified("items")) {
    const total = this.items.reduce(
      (sum, item) => sum + item.quantity * item.price,
      0
    );
    this.totalAmount = total;

    for (const item of this.items) {
      const product = await mongoose.model("Product").findById(item.productId);
      if (product && product.stock >= item.quantity) {
        product.stock -= item.quantity;
        await product.save();
      } else {
        throw new Error(`Not enough stock for product ${item.productId}`);
      }
    }
  }
  next();
});

orderSchema.pre("findOneAndUpdate", async function (next) {
  const update = this.getUpdate();
  
  if (update.$set && update.$set.items) {

    const oldOrder = await this.model.findOne(this.getQuery());
    const oldItems = oldOrder ? oldOrder.items : [];

    const total = update.$set.items.reduce(
      (sum, item) => sum + item.quantity * item.price,
      0
    );
    update.$set.totalAmount = total;

    for (const item of update.$set.items) {
      const product = await mongoose.model("Product").findById(item.productId);
      if (product && product.stock >= item.quantity) {

        const oldItem = oldItems.find((old) => old.productId.toString() === item.productId.toString());
        if (!oldItem) {

        product.stock -= item.quantity;
      } else {
        const diff = item.quantity - oldItem.quantity;
          product.stock -= diff;
        }
        await product.save();
      } else {
        return next(new Error(`Not enough stock for product ${item.productId}`));
      }
    }

    for (const oldItem of oldItems) {
      if (!update.$set.items.some((item) => item.productId.toString() === oldItem.productId.toString())) {

        const product = await mongoose.model("Product").findById(oldItem.productId);
        if (product) {
          product.stock += oldItem.quantity;
          await product.save();
        }
      }
    }
  }

  next();
});

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;
