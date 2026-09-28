//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const GiftController = require("../../controllers/client/gift.controller");

//get gifts ( when view live )
route.get("/fetchGiftCollection", checkAccessWithSecretKey(), GiftController.fetchGiftCollection);

module.exports = route;
