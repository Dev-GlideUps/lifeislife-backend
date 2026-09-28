//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

//controller
const HostApplicationController = require("../../controllers/admin/hostApplication.controller");

//get host application statistics
route.get("/fetchHostApplicationStatistics", checkPermission(MODULES.HOST_APPLICATION), checkAccessWithSecretKey(), HostApplicationController.fetchHostApplicationStatistics);

//get host applications
route.get("/getHostApplicationsList", checkPermission(MODULES.HOST_APPLICATION), checkAccessWithSecretKey(), HostApplicationController.getHostApplicationsList);

module.exports = route;
