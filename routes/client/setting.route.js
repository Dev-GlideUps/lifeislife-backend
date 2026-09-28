//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//validate user's access token
const validateUserToken = require("../../middleware/validateUserToken.middleware");

//controller
const SettingController = require("../../controllers/client/setting.controller");

//get setting
route.get("/loadAppSettings", validateUserToken, checkAccessWithSecretKey(), SettingController.loadAppSettings);

//get only profilePhotoList from setting
route.get("/getProfilePhotoList", checkAccessWithSecretKey(), SettingController.getProfilePhotoList);

//get active third party games
route.get("/fetchActiveThirdPartyGames", validateUserToken, checkAccessWithSecretKey(), SettingController.fetchActiveThirdPartyGames);

module.exports = route;
