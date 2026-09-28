//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const CoinTraderHistoryController = require("../../controllers/admin/coinTraderHistory.controller");

//get coinTrader's history
route.get("/getCoinTraderHistory", checkAccessWithSecretKey(), CoinTraderHistoryController.getCoinTraderHistory);

module.exports = route;
