// constants/orderStatus.js
const ORDER_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  SHIPPED: "shipped",
  DELIVERED: "delivered",
  CANCELLED: "cancelled",
};

const ALLOWED_ORDER_STATUSES = Object.values(ORDER_STATUS);

module.exports = {
  ORDER_STATUS,
  ALLOWED_ORDER_STATUSES,
};
