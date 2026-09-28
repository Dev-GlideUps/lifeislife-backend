//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const ReactionController = require("../../controllers/client/reaction.controller");

//get gifts ( when view live )
route.get("/getReactionEmojis", checkAccessWithSecretKey(), ReactionController.getReactionEmojis);

module.exports = route;
