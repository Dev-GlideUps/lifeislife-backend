//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const HistoryController = require("../../controllers/admin/history.controller");

//get coin history
route.get("/fetchCoinHistory", checkAccessWithSecretKey(), HistoryController.fetchCoinHistory);

//get type wise coin history
route.get("/fetchTypeFilteredCoinHistory", checkAccessWithSecretKey(), HistoryController.fetchTypeFilteredCoinHistory);

//get earnings report for each agency, ( agency earnings and host earnings and number of hosts under each agency )
route.get("/fetchAgencyEarningsReport", checkAccessWithSecretKey(), HistoryController.fetchAgencyEarningsReport);

//get agency's earning history
route.get("/fetchAgencyCommissionRecords", checkAccessWithSecretKey(), HistoryController.fetchAgencyCommissionRecords);

//get game history
route.get("/fetchgameRecords", checkAccessWithSecretKey(), HistoryController.fetchgameRecords);

//calls management (call history summary)
route.get("/fetchCallsSummary", checkAccessWithSecretKey(), HistoryController.fetchCallsSummary);

//calls management (call history)
route.get("/fetchCallsManagement", checkAccessWithSecretKey(), HistoryController.fetchCallsManagement);

//end private call by admin
route.patch("/terminateCallByAdmin", checkAccessWithSecretKey(), HistoryController.terminateCallByAdmin);

//get lucky gift history
route.get("/retrieveLuckyGiftHistory", checkAccessWithSecretKey(), HistoryController.retrieveLuckyGiftHistory);

module.exports = route;
