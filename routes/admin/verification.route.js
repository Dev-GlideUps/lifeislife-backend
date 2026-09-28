//express
const express = require("express");
const route = express.Router();

const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const verificationController = require("../../controllers/admin/verification.controller");

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

// Update verification request status (accept / decline)
route.patch("/updateVerificationStatus", checkPermission(MODULES.USER_VERIFICATION), checkAccessWithSecretKey(), verificationController.updateVerificationStatus);

// Get verification statistics
route.get("/fetchVerificationStatistics", checkPermission(MODULES.USER_VERIFICATION), checkAccessWithSecretKey(), verificationController.fetchVerificationStatistics);

// Get verification
route.get("/getVerifications", checkPermission(MODULES.USER_VERIFICATION), checkAccessWithSecretKey(), verificationController.getVerifications);

module.exports = route;
