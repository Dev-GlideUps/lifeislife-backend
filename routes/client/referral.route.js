//express
const express = require("express");
const route = express.Router();

const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const referralController = require("../../controllers/client/referral.controller");

//apply referral code
route.post("/submitReferralCode", checkAccessWithSecretKey(), referralController.submitReferralCode);

//get user's referral history
route.get("/fetchReferralHistory", checkAccessWithSecretKey(), referralController.fetchReferralHistory);

module.exports = route;
