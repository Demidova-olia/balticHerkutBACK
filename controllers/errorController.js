module.exports = (err, req, res, next) => {
  // Логируем ошибку в консоль для отладки
  console.error("🔴 Global Error Handler:", {
    message: err.message,
    stack: err.stack,
    name: err.name,
    code: err.code,
  });

  err.statusCode = err.statusCode || 500;
  err.status = err.status || "error";

  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
  });
};
