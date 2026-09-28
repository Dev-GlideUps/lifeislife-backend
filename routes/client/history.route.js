//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const HistoryController = require("../../controllers/client/history.controller");

//validate user's access token
const validateUserToken = require("../../middleware/validateUserToken.middleware");

//get user's coin history
route.get("/getUserTransactionHistory", validateUserToken, checkAccessWithSecretKey(), HistoryController.getUserTransactionHistory);

//get user's gift received history
route.get("/getUserReceivedGiftHistory", validateUserToken, checkAccessWithSecretKey(), HistoryController.getUserReceivedGiftHistory);

//get toUser's gift received history
route.get("/retrieveUserGiftHistory", checkAccessWithSecretKey(), HistoryController.retrieveUserGiftHistory);

//get users who consumed coins ( rich )
route.get("/fetchTopCoinConsumers", checkAccessWithSecretKey(), HistoryController.fetchTopCoinConsumers);

//get top gift senders and top gift receivers ( gifts )
route.get("/fetchTopGiftStats", checkAccessWithSecretKey(), HistoryController.fetchTopGiftStats);

//get coin consumed by gifting in liveRoom ( fansRanking )
route.get("/getFansRanking", checkAccessWithSecretKey(), HistoryController.getFansRanking);

module.exports = route;
