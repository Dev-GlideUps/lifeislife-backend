//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const liveStreamerHistoryController = require("../../controllers/admin/liveStreamerHistory.controller");

//get livehistory
route.get("/getLiveSessionHistory", checkAccessWithSecretKey(), liveStreamerHistoryController.getLiveSessionHistory);

module.exports = route;
