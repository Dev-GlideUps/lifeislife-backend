//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const ThemeController = require("../../controllers/client/theme.controller");

//get theme
route.get("/getThemeList", checkAccessWithSecretKey(), ThemeController.getThemeList);

module.exports = route;
