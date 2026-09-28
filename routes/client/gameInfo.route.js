const express = require("express");
const route = express.Router();

const checkAccessWithSecretKey = require("../../checkAccess");
const GameInfoController = require("../../controllers/client/gameInfo.controller");

// get all third party game info
route.get("/getGameInfoList", checkAccessWithSecretKey(), GameInfoController.getGameInfoList);

module.exports = route;
