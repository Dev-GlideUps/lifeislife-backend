//express
const express = require("express");
const route = express.Router();

//multer
const multer = require("multer");
const storage = require("../../util/multer");
const upload = multer({ storage });

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

//controller
const PayoutMethodController = require("../../controllers/admin/payoutMethod.controller");

//create payout method
route.post("/createPayoutMethod", checkPermission(MODULES.PAYMENT_METHODS), checkAccessWithSecretKey(), upload.single("image"), PayoutMethodController.createPayoutMethod);

//update payout method
route.patch("/editPayoutMethod", checkPermission(MODULES.PAYMENT_METHODS), checkAccessWithSecretKey(), upload.single("image"), PayoutMethodController.editPayoutMethod);

//handle the isActive status of the payout method
route.patch("/updatePayoutMethodStatus", checkPermission(MODULES.PAYMENT_METHODS), checkAccessWithSecretKey(), PayoutMethodController.updatePayoutMethodStatus);

//get payout methods
route.get("/retrievePayoutMethods", checkPermission(MODULES.PAYMENT_METHODS), checkAccessWithSecretKey(), PayoutMethodController.retrievePayoutMethods);

//disable payout method
route.delete("/removePayoutMethod", checkPermission(MODULES.PAYMENT_METHODS), checkAccessWithSecretKey(), PayoutMethodController.removePayoutMethod);

module.exports = route;
