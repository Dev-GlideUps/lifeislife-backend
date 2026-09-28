const express = require("express");
const route = express.Router();

//Controller
const ReferralSystemController = require("../../controllers/client/referralSystem.controller");

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//get referral system
route.get("/fetchReferralSystems", checkAccessWithSecretKey(), ReferralSystemController.fetchReferralSystems);

module.exports = route;
