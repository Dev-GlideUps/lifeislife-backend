//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const HostApplicationController = require("../../controllers/agency/hostApplication.controller");

//get agency's host applications
route.get("/listHostApplications", checkAccessWithSecretKey(), HostApplicationController.listHostApplications);

//accept or decline agency's host application
route.patch("/manageHostRequest", checkAccessWithSecretKey(), HostApplicationController.manageHostRequest);

module.exports = route;
