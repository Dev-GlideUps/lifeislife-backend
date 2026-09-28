//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const WealthLevelController = require("../../controllers/client/wealthLevel.controller");

//get wealthLevel
route.get("/retrieveWealthHierarchy", checkAccessWithSecretKey(), WealthLevelController.retrieveWealthHierarchy);

module.exports = route;
