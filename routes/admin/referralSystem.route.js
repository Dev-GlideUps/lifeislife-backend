const express = require("express");
const route = express.Router();

//Controller
const ReferralSystemController = require("../../controllers/admin/referralSystem.controller");

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

//create referral
route.post("/addReferralSystem", checkPermission(MODULES.REFERRAL_SYSTEM), checkAccessWithSecretKey(), ReferralSystemController.addReferralSystem);

//update referral system
route.patch("/modifyReferralSystem", checkPermission(MODULES.REFERRAL_SYSTEM), checkAccessWithSecretKey(), ReferralSystemController.modifyReferralSystem);

//update referral system active status
route.patch("/updateReferralSystemState", checkPermission(MODULES.REFERRAL_SYSTEM), checkAccessWithSecretKey(), ReferralSystemController.updateReferralSystemState);

//get referral system
route.get("/retrieveReferralSystems", checkPermission(MODULES.REFERRAL_SYSTEM), checkAccessWithSecretKey(), ReferralSystemController.retrieveReferralSystems);

//delete referral system
route.delete("/removeReferralSystem", checkPermission(MODULES.REFERRAL_SYSTEM), checkAccessWithSecretKey(), ReferralSystemController.removeReferralSystem);

module.exports = route;
