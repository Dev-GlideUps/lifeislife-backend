//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const SettingController = require("../../controllers/host/setting.controller");

//get payment methods
route.get("/getSettingsData", checkAccessWithSecretKey(), SettingController.getSettingsData);

module.exports = route;
