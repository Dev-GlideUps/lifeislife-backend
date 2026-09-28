//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const PayoutRequestController = require("../../controllers/agency/payoutRequest.controller");

//submit payout request
route.post("/requestAgencyPayout", checkAccessWithSecretKey(), PayoutRequestController.requestAgencyPayout);

//get payout requests
route.get("/getAgencyWisePayoutRequests", checkAccessWithSecretKey(), PayoutRequestController.getAgencyWisePayoutRequests);

//manage host's payout request
route.patch("/modifyWithdrawalStatus", checkAccessWithSecretKey(), PayoutRequestController.modifyWithdrawalStatus);

module.exports = route;
