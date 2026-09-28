//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const PayoutMethodController = require("../../controllers/client/payoutMethod.controller");

//get payment methods
route.get("/fetchPayoutMethods", checkAccessWithSecretKey(), PayoutMethodController.fetchPayoutMethods);

module.exports = route;
