//express
const express = require("express");
const route = express.Router();

//require host's route.js
const host = require("./host.route");
const history = require("./history.route");
const payoutRequest = require("./payoutRequest.route");

//exports host's route.js
route.use("/", host);
route.use("/history", history);
route.use("/payoutRequest", payoutRequest);

module.exports = route;
