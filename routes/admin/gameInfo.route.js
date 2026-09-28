const express = require("express");
const route = express.Router();

const checkAccessWithSecretKey = require("../../checkAccess");
const GameInfoController = require("../../controllers/admin/gameInfo.controller");

// sync third party games
route.post("/syncThirdPartyGames", checkAccessWithSecretKey(), GameInfoController.syncThirdPartyGames);

// get all third party game info
route.get("/fetchGameInfoList", checkAccessWithSecretKey(), GameInfoController.fetchGameInfoList);

// third party game active/inactive
route.put("/toggleGameInfoStatus", checkAccessWithSecretKey(), GameInfoController.toggleGameInfoStatus);

module.exports = route;
