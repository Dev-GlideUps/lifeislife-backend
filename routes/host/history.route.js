//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const HistoryController = require("../../controllers/host/history.controller");

//get host's coin history
route.get("/getHostEarningsHistory", checkAccessWithSecretKey(), HistoryController.getHostEarningsHistory);

//get host's coin history ( call, gift )
route.get("/retrieveHostEarningStats", checkAccessWithSecretKey(), HistoryController.retrieveHostEarningStats);

//get host's livehistory
route.get("/getHostLiveStreamSummary", checkAccessWithSecretKey(), HistoryController.getHostLiveStreamSummary);

module.exports = route;
