//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const HostApplicationController = require("../../controllers/client/hostApplication.controller");

//validate either agency code or user unique ID
route.get("/validateAgencyOrUser", checkAccessWithSecretKey(), HostApplicationController.validateAgencyOrUser);

//submit host application
route.post("/applyHostApplication", checkAccessWithSecretKey(), HostApplicationController.applyHostApplication);

//get host's request status
route.get("/checkHostApplicationStatus", checkAccessWithSecretKey(), HostApplicationController.checkHostApplicationStatus);

module.exports = route;
