//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const HostController = require("../../controllers/host/host.controller");

//get host's profile
route.get("/fetchHostProfile", checkAccessWithSecretKey(), HostController.fetchHostProfile);

module.exports = route;
