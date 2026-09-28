//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const AgencyCommissionController = require("../../controllers/agency/agencyCommission.controller");

//fetch agency commission records
route.get("/fetchCommissionStats", checkAccessWithSecretKey(), AgencyCommissionController.fetchCommissionStats);

module.exports = route;
