//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const CoinTraderController = require("../../controllers/admin/cointrader.controller");

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

//create coinTrader
route.post("/registerCoinTrader", checkPermission(MODULES.COIN_TRADER), checkAccessWithSecretKey(), CoinTraderController.registerCoinTrader);

//coin add or coin less
route.patch("/updateCoinForTraderByAdmin", checkPermission(MODULES.COIN_TRADER), checkAccessWithSecretKey(), CoinTraderController.updateCoinForTraderByAdmin);

//manage coinTrader's active or inactive status
route.patch("/updateCoinTraderActiveStatus", checkPermission(MODULES.COIN_TRADER), checkAccessWithSecretKey(), CoinTraderController.updateCoinTraderActiveStatus);

//update coinTrader's profile
route.patch("/updateCoinTraderProfile", checkPermission(MODULES.COIN_TRADER), checkAccessWithSecretKey(), CoinTraderController.updateCoinTraderProfile);

//get coinTrader statistics
route.get("/fetchCoinTraderStatistics", checkPermission(MODULES.COIN_TRADER), checkAccessWithSecretKey(), CoinTraderController.fetchCoinTraderStatistics);

//get coinTraders
route.get("/getAllCoinTraders", checkPermission(MODULES.COIN_TRADER), checkAccessWithSecretKey(), CoinTraderController.getAllCoinTraders);

module.exports = route;
