//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const AgencyController = require("../../controllers/agency/agency.controller");

//get agency profile
route.get("/fetchAgencyInfo", checkAccessWithSecretKey(), AgencyController.fetchAgencyInfo);

module.exports = route;
