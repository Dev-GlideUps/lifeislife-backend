//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const BlockController = require("../../controllers/admin/block.controller");

//get blocked user
route.get("/fetchBlockedUserList", checkAccessWithSecretKey(), BlockController.fetchBlockedUserList);

module.exports = route;
