//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const WealthLevelController = require("../../controllers/admin/wealthLevel.controller");

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

//multer
const multer = require("multer");
const storage = require("../../util/multer");
const upload = multer({ storage });

//create wealthLevel
route.post("/createWealthLevel", checkPermission(MODULES.WEALTH_LEVEL), checkAccessWithSecretKey(), upload.single("levelImage"), WealthLevelController.createWealthLevel);

//update wealthLevel
route.patch("/updateWealthLevel", checkPermission(MODULES.WEALTH_LEVEL), checkAccessWithSecretKey(), upload.single("levelImage"), WealthLevelController.updateWealthLevel);

//update the specific permission
route.patch("/updateWealthLevelPermissions", checkPermission(MODULES.WEALTH_LEVEL), checkAccessWithSecretKey(), WealthLevelController.updateWealthLevelPermissions);

//get wealthLevel
route.get("/getWealthLevels", checkPermission(MODULES.WEALTH_LEVEL), checkAccessWithSecretKey(), WealthLevelController.getWealthLevels);

//delete wealthLevel
route.delete("/deleteWealthLevel", checkPermission(MODULES.WEALTH_LEVEL), checkAccessWithSecretKey(), WealthLevelController.deleteWealthLevel);

module.exports = route;
