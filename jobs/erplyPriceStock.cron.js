const cron = require("node-cron");
const Product = require("../models/productModel");
const { syncPriceStockByErplyId } = require("../services/erplySyncService");

// каждые 10 минут обновляем price/stock
cron.schedule("*/10 * * * *", async () => {
  try {
    const batchSize = 200;
    let skip = 0;
    for (;;) {
      const batch = await Product.find({ erplyId: { $exists: true, $ne: null }, isActive: true })
        .select("_id erplyId")
        .skip(skip)
        .limit(batchSize)
        .lean();
      if (!batch.length) break;

      for (const p of batch) {
        try {
          await syncPriceStockByErplyId(p.erplyId);
        } catch (e) {
          console.warn("[cron] syncPriceStockByErplyId error:", p.erplyId, e?.message);
        }
      }
      skip += batch.length;
    }
  } catch (e) {
    console.error("[cron] top-level error:", e);
  }
});
