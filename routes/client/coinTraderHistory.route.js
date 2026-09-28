//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const CoinTraderHistoryController = require("../../controllers/client/coinTraderHistory.controller");

//retrieves the coin spending history of a coinTrader user
route.get("/historyOfCoinTraderToUser", checkAccessWithSecretKey(), CoinTraderHistoryController.historyOfCoinTraderToUser);

module.exports = route;
