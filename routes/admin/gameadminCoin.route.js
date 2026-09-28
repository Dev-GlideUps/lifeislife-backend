//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const GameadminCoinController = require("../../controllers/admin/gameadminCoin.controller");

//reset game admin's coin
route.patch("/resetGameAdminCoins", checkAccessWithSecretKey(), GameadminCoinController.resetGameAdminCoins);

module.exports = route;
