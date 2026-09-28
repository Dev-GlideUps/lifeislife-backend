//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const HistoryController = require("../../controllers/agency/history.controller");

//get host's coin history
route.get("/getHostCoinHistory", checkAccessWithSecretKey(), HistoryController.getHostCoinHistory);

//get host's coin history ( call, gift )
route.get("/retrieveHostCoinHistory", checkAccessWithSecretKey(), HistoryController.retrieveHostCoinHistory);

//get host's livehistory
route.get("/fetchLiveSessionHistory", checkAccessWithSecretKey(), HistoryController.fetchLiveSessionHistory);

//get agency's earnings report ( agency earnings and host earnings and number of hosts under each agency )
route.get("/getEarningsByAgency", checkAccessWithSecretKey(), HistoryController.getEarningsByAgency);

module.exports = route;
