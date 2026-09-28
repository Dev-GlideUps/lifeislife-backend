//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const LikeHistoryController = require("../../controllers/admin/likeHistory.controller");

//fetch like history ( post / video )
route.get("/fetchUserLikeHistoryByType", checkAccessWithSecretKey(), LikeHistoryController.fetchUserLikeHistoryByType);

module.exports = route;
