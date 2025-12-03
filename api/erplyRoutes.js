router.post("/erply/import/id/:erplyId", erplyCtrl.importFromErplyById);
router.post("/erply/import/barcode/:barcode", erplyCtrl.importFromErplyByBarcode);
router.post("/erply/ensure/:barcode", erplyCtrl.ensureByBarcode);
router.post("/:id/erply-sync-price-stock", erplyCtrl.syncPriceStock);

module.exports = router;