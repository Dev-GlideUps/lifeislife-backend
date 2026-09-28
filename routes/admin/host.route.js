//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

//controller
const HostController = require("../../controllers/admin/host.controller");

//get host statistics
route.get("/fetchHostsStatistics", checkPermission(MODULES.HOST_LIST), checkAccessWithSecretKey(), HostController.fetchHostsStatistics);

//get hosts
route.get("/retrieveHosts", checkPermission(MODULES.HOST_LIST), checkAccessWithSecretKey(), HostController.retrieveHosts);

//suspend or terminate inactive or fraudulent host
route.patch("/blockOrUnblockHost", checkPermission(MODULES.HOST_LIST), checkAccessWithSecretKey(), HostController.blockOrUnblockHost);

module.exports = route;
