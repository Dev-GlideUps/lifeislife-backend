//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const BlockController = require("../../controllers/client/block.controller");

//block or unblock user
route.post("/manageUserBlockStatus", checkAccessWithSecretKey(), BlockController.manageUserBlockStatus);

//get blocked user
route.get("/listBlockedUsers", checkAccessWithSecretKey(), BlockController.listBlockedUsers);

module.exports = route;
