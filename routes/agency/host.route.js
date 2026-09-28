//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const HostController = require("../../controllers/agency/host.controller");

//validate either an agencyCode or a uniqueId
route.get("/validateIdentifier", checkAccessWithSecretKey(), HostController.validateIdentifier);

//add host
route.post("/addHost", checkAccessWithSecretKey(), HostController.addHost);

//get agency's hosts
route.get("/listAgencyHosts", checkAccessWithSecretKey(), HostController.listAgencyHosts);

//toggle host's block status
route.patch("/toggleHostBlockStatus", checkAccessWithSecretKey(), HostController.toggleHostBlockStatus);

module.exports = route;
