//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const HelpController = require("../../controllers/admin/help.controller");

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

//get help statistics
route.get("/fetchHelpStatistics", checkPermission(MODULES.HELP), checkAccessWithSecretKey(), HelpController.fetchHelpStatistics);

//get helps
route.get("/loadHelpContent", checkPermission(MODULES.HELP), checkAccessWithSecretKey(), HelpController.loadHelpContent);

//help solved
route.patch("/resolveUserHelp", checkPermission(MODULES.HELP), checkAccessWithSecretKey(), HelpController.resolveUserHelp);

//delete help
route.delete("/deleteUserHelp", checkPermission(MODULES.HELP), checkAccessWithSecretKey(), HelpController.deleteUserHelp);

module.exports = route;
