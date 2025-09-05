module.exports = function rolesMiddleware(...allowed) {
  // Позволяем передавать либо список ролей, либо массив одной строкой
  // rolesMiddleware("admin") ИЛИ rolesMiddleware(["admin", "manager"])
  let allowedRoles = allowed;

  if (allowed.length === 1 && Array.isArray(allowed[0])) {
    allowedRoles = allowed[0];
  }

  // Нормализуем к строкам в нижнем регистре
  allowedRoles = (allowedRoles || []).map((r) => String(r || "").toLowerCase());

  return (req, res, next) => {
    const role = String(req.user?.role || "").toLowerCase();

    if (!req.user || !allowedRoles.includes(role)) {
      return res.status(403).send({ message: "Access denied" });
    }

    next();
  };
};
