//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const CoinPlanController = require("../../controllers/admin/coinPlan.controller");

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

//create coinplan
route.post("/storeCoinPlan", checkPermission(MODULES.COIN_PLAN), checkAccessWithSecretKey(), CoinPlanController.storeCoinPlan);

//update coinplan
route.patch("/updateCoinPlan", checkPermission(MODULES.COIN_PLAN), checkAccessWithSecretKey(), CoinPlanController.updateCoinPlan);

//update coinplan status
route.patch("/switchCoinPlanStatus", checkPermission(MODULES.COIN_PLAN), checkAccessWithSecretKey(), CoinPlanController.switchCoinPlanStatus);

//delete coinplan
route.delete("/deleteCoinPlan", checkPermission(MODULES.COIN_PLAN), checkAccessWithSecretKey(), CoinPlanController.deleteCoinPlan);

//get coinPlan
route.get("/getCoinPlans", checkPermission(MODULES.COIN_PLAN), checkAccessWithSecretKey(), CoinPlanController.getCoinPlans);

//get coin plan statistics
route.get("/fetchCoinPlanStatistics", checkPermission(MODULES.COIN_PLAN), checkAccessWithSecretKey(), CoinPlanController.fetchCoinPlanStatistics);

//get coinplan histories of users (admin earning)
route.get("/getUserCoinPlanTransactions", checkAccessWithSecretKey(), CoinPlanController.getUserCoinPlanTransactions);

module.exports = route;
