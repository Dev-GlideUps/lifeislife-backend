//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const PayoutRequestController = require("../../controllers/admin/payoutRequest.controller");

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

//get payout requests (user/host/agency)
route.get("/getPayoutRequests", checkPermission(MODULES.PAYOUT_REQUESTS), checkAccessWithSecretKey(), PayoutRequestController.getPayoutRequests);

//get payout overview
route.get("/getPayoutRequestSummary", checkPermission(MODULES.PAYOUT_REQUESTS), checkAccessWithSecretKey(), PayoutRequestController.getPayoutRequestSummary);

//withdrawal trend (pending/approved/rejected)
route.get("/fetchWithdrawalTrend", checkPermission(MODULES.PAYOUT_REQUESTS), checkAccessWithSecretKey(), PayoutRequestController.fetchWithdrawalTrend);

//manage payout request (user/host/agency)
route.patch("/updateWithdrawalStatus", checkPermission(MODULES.PAYOUT_REQUESTS), checkAccessWithSecretKey(), PayoutRequestController.updateWithdrawalStatus);

module.exports = route;
