//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const payoutRequestController = require("../../controllers/host/payoutRequest.controller");

//get host's payout requests
route.get("/retrieveHostPayouts", checkAccessWithSecretKey(), payoutRequestController.retrieveHostPayouts);

module.exports = route;
