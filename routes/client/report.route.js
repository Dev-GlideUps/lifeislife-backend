//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const ReportController = require("../../controllers/client/report.controller");

//report made by user
route.post("/userSubmittedReport", checkAccessWithSecretKey(), ReportController.userSubmittedReport);

module.exports = route;
