//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const AgencyController = require("../../controllers/admin/agency.controller");

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

//multer
const multer = require("multer");
const storage = require("../../util/multer");
const upload = multer({ storage });

//create agency
route.post("/registerUserAsAgency", checkPermission(MODULES.AGENCY), checkAccessWithSecretKey(), upload.single("image"), AgencyController.registerUserAsAgency);

//update agency
route.patch("/updateAgencyProfile", checkPermission(MODULES.AGENCY), checkAccessWithSecretKey(), upload.single("image"), AgencyController.updateAgencyProfile);

//manage agency's active status
route.patch("/modifyAgencyStatus", checkPermission(MODULES.AGENCY), checkAccessWithSecretKey(), AgencyController.modifyAgencyStatus);

//admin add / deduct agency earning
route.post("/adminAdjustAgencyEarning", checkPermission(MODULES.AGENCY), checkAccessWithSecretKey(), AgencyController.adminAdjustAgencyEarning);

//get agency dashboard stats
route.get("/fetchAgencyDashboardStats", checkPermission(MODULES.AGENCY), checkAccessWithSecretKey(), AgencyController.fetchAgencyDashboardStats);

//get agencies
route.get("/fetchAgencyRecord", checkPermission(MODULES.AGENCY), checkAccessWithSecretKey(), AgencyController.fetchAgencyRecord);

//get agency's hosts
route.get("/fetchAgencyHostList", checkAccessWithSecretKey(), AgencyController.fetchAgencyHostList);

//get agency's pending host applications
route.get("/fetchAgencyPendingHostList", checkAccessWithSecretKey(), AgencyController.fetchAgencyPendingHostList);

//get agency's suspended hosts
route.get("/fetchAgencySuspendedHosts", checkAccessWithSecretKey(), AgencyController.fetchAgencySuspendedHosts);

module.exports = route;
