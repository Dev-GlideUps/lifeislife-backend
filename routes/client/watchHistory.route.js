//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const WatchHistoryController = require("../../controllers/client/watchHistory.controller");

//when user view the video
route.post("/addWatchHistory", checkAccessWithSecretKey(), WatchHistoryController.addWatchHistory);

module.exports = route;
