//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const SettingController = require("../../controllers/agency/setting.controller");

//get payment methods
route.get("/fetchAppSettings", checkAccessWithSecretKey(), SettingController.fetchAppSettings);

module.exports = route;
