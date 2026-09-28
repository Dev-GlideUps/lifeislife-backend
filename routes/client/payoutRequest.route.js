//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const PayoutRequestController = require("../../controllers/client/payoutRequest.controller");

//submit payout request
route.post("/submitPayoutRequest", checkAccessWithSecretKey(), PayoutRequestController.submitPayoutRequest);

//retrieve all payout requests for a user
route.get("/retrieveUserPayouts", checkAccessWithSecretKey(), PayoutRequestController.retrieveUserPayouts);

module.exports = route;
