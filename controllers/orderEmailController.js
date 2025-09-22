// controllers/orderEmailController.js
let nodemailer;
try {
  nodemailer = require("nodemailer");
} catch {
  nodemailer = null;
}

const required = (v, name) => {
  if (!v) throw new Error(`Missing required field: ${name}`);
  return v;
};

const renderText = ({ order, customer }) => {
  const lines = [];
  lines.push(`Новый заказ с сайта`);
  lines.push(`Дата: ${new Date().toLocaleString("ru-RU")}`);
  lines.push("");
  lines.push(`Покупатель:`);
  lines.push(`Имя: ${customer.name}`);
  lines.push(`Email: ${customer.email}`);
  if (customer.phone) lines.push(`Телефон: ${customer.phone}`);
  if (customer.address) lines.push(`Адрес: ${customer.address}`);
  if (customer.notes) lines.push(`Комментарий: ${customer.notes}`);
  lines.push("");
  lines.push(`Состав заказа:`);
  (order.items || []).forEach((it, idx) => {
    lines.push(
      `${idx + 1}) ${it.name} — ${Number(it.quantity || 0)} x ${Number(
        it.price || 0
      ).toFixed(2)} €`
    );
  });
  lines.push("");
  lines.push(`Итого: ${Number(order.total || 0).toFixed(2)} €`);
  return lines.join("\n");
};

const renderHTML = ({ order, customer }) => {
  const rows =
    (order.items || [])
      .map(
        (it, i) => `
      <tr>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;">${i + 1}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;">${it.name}</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right;">${Number(
          it.price || 0
        ).toFixed(2)} €</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:center;">${
          it.quantity || 0
        }</td>
        <td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right;">${(
          Number(it.price || 0) * Number(it.quantity || 0)
        ).toFixed(2)} €</td>
      </tr>`
      )
      .join("") || "";

  return `<!doctype html>
<html><body style="font-family:Segoe UI,Roboto,Arial,sans-serif;color:#0f172a">
  <h2 style="margin:0 0 8px">Новый заказ с сайта</h2>
  <div style="color:#475569;font-size:14px;margin-bottom:12px">${new Date().toLocaleString(
    "ru-RU"
  )}</div>

  <h3 style="margin:14px 0 6px">Покупатель</h3>
  <table cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px">
    <tr><td style="padding:4px 8px;color:#334155">Имя:</td><td style="padding:4px 8px"><strong>${
      customer.name
    }</strong></td></tr>
    <tr><td style="padding:4px 8px;color:#334155">Email:</td><td style="padding:4px 8px">${
      customer.email
    }</td></tr>
    ${customer.phone ? `<tr><td style="padding:4px 8px;color:#334155">Телефон:</td><td style="padding:4px 8px">${customer.phone}</td></tr>` : ""}
    ${customer.address ? `<tr><td style="padding:4px 8px;color:#334155">Адрес:</td><td style="padding:4px 8px">${customer.address}</td></tr>` : ""}
    ${customer.notes ? `<tr><td style="padding:4px 8px;color:#334155">Комментарий:</td><td style="padding:4px 8px">${customer.notes}</td></tr>` : ""}
  </table>

  <h3 style="margin:16px 0 6px">Состав заказа</h3>
  <table cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;font-size:14px">
    <thead>
      <tr style="background:#f8fafc">
        <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">#</th>
        <th style="padding:8px;border:1px solid #e5e7eb;text-align:left">Товар</th>
        <th style="padding:8px;border:1px solid #e5e7eb;text-align:right">Цена</th>
        <th style="padding:8px;border:1px solid #e5e7eb;text-align:center">Кол-во</th>
        <th style="padding:8px;border:1px solid #e5e7eb;text-align:right">Сумма</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="4" style="padding:10px;border:1px solid #e5e7eb;text-align:right"><strong>Итого</strong></td>
        <td style="padding:10px;border:1px solid #e5e7eb;text-align:right"><strong>${Number(
          order.total || 0
        ).toFixed(2)} €</strong></td>
      </tr>
    </tfoot>
  </table>
</body></html>`;
};

exports.sendOrderEmail = async (req, res) => {
  try {
    if (!nodemailer) {
      return res.status(500).json({ message: "Email service not installed (nodemailer missing)" });
    }

    const to = process.env.ORDER_TO || "baltic.herkut@gmail.com";
    const customer = required(req.body.customer, "customer");
    const order = required(req.body.order, "order");

    if (!customer.name || !customer.email) {
      return res.status(400).json({ message: "Name and email are required" });
    }
    if (!order.items || !Array.isArray(order.items) || order.items.length === 0) {
      return res.status(400).json({ message: "Order items are required" });
    }
    const fromUser = process.env.MAIL_FROM || "baltic.herkut@gmail.com";
    const appPass = process.env.MAIL_APP_PASSWORD;
    const host = process.env.SMTP_HOST || "smtp.gmail.com";
    const port = Number(process.env.SMTP_PORT || 587); 
    const secure = port === 465; 

    if (!fromUser || !appPass) {
      return res.status(500).json({ message: "Mail credentials are not configured" });
    }

    const subject =
      req.body.subject ||
      `Новый заказ — ${customer.name} (${Number(order.total || 0).toFixed(2)} €)`;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user: fromUser, pass: appPass },
    });

    await transporter.verify();

    const text = renderText({ order, customer });
    const html = renderHTML({ order, customer });

    const info = await transporter.sendMail({
      from: `"Baltic Herkut" <${fromUser}>`,
      to,
      subject,
      text,
      html,
    });

    res.json({ ok: true, messageId: info.messageId });
  } catch (err) {

    console.error("sendOrderEmail error:", {
      message: err?.message,
      code: err?.code,
      command: err?.command,
      response: err?.response,
      stack: err?.stack,
    });

    res.status(500).json({
      message: "Failed to send order email",
      reason: err?.message || "Unknown error",
      code: err?.code || null,
    });
  }
};
