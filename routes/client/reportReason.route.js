//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const ReportReasonController = require("../../controllers/client/reportReason.controller");

//get reportReason (when report by user)
route.get("/fetchViolationReason", checkAccessWithSecretKey(), ReportReasonController.fetchViolationReason);

module.exports = route;
