//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//validate user's access token
const validateUserToken = require("../../middleware/validateUserToken.middleware");

//controller
const CoinTraderController = require("../../controllers/client/coinTrader.controller");

//coin purchased from coinTrader
route.post("/purchaseCoinFromCoinTrader", checkAccessWithSecretKey(), CoinTraderController.purchaseCoinFromCoinTrader);

//get coinseller's profile
route.get("/fetchCoinTraderProfile", validateUserToken, checkAccessWithSecretKey(), CoinTraderController.fetchCoinTraderProfile);

//get active coinTrader list
route.get("/fetchActiveCoinTraderList", validateUserToken, checkAccessWithSecretKey(), CoinTraderController.fetchActiveCoinTraderList);

module.exports = route;
