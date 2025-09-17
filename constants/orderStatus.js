// constants/orderStatus.js
const ORDER_STATUS = {
  PENDING:   "pending",
  PROCESSING:"processing",
  SHIPPED:   "shipped",
  DELIVERED: "delivered",
  CANCELED:  "canceled",  // канонически с одной L
  PAID:      "paid",
  FINISHED:  "finished",
};

// Распознаём синонимы и разные регистры
const STATUS_ALIASES = {
  cancelled: "canceled",
  cancel:    "canceled",
  Canceled:  "canceled",
  Cancelled: "canceled",
};

function normalizeStatus(s) {
  const key = String(s || "").trim().toLowerCase();
  return STATUS_ALIASES[key] || key;
}

const ALLOWED_ORDER_STATUSES = Object.values(ORDER_STATUS);

module.exports = {
  ORDER_STATUS,
  ALLOWED_ORDER_STATUSES,
  normalizeStatus,
};
