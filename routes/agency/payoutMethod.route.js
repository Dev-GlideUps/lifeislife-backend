//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const PayoutMethodController = require("../../controllers/agency/payoutMethod.controller");

//get payment methods
route.get("/fetchAvailablePayoutMethods", checkAccessWithSecretKey(), PayoutMethodController.fetchAvailablePayoutMethods);

module.exports = route;
