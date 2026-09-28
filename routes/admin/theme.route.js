//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const ThemeController = require("../../controllers/admin/theme.controller");

//multer
const multer = require("multer");
const storage = require("../../util/multer");
const upload = multer({ storage });

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

//create theme
route.post("/createTheme", checkPermission(MODULES.STORE_THEMES), checkAccessWithSecretKey(), upload.single("image"), ThemeController.createTheme);

//update theme
route.patch("/updateTheme", checkPermission(MODULES.STORE_THEMES), checkAccessWithSecretKey(), upload.single("image"), ThemeController.updateTheme);

//toggling the isActive status of a theme
route.patch("/toggleThemeStatus", checkPermission(MODULES.STORE_THEMES), checkAccessWithSecretKey(), ThemeController.toggleThemeStatus);

//toggling ride recommendation
route.patch("/toggleThemeRecommendation", checkPermission(MODULES.STORE_THEMES), checkAccessWithSecretKey(), ThemeController.toggleThemeRecommendation);

//get theme
route.get("/getThemes", checkPermission(MODULES.STORE_THEMES), checkAccessWithSecretKey(), ThemeController.getThemes);

//delete theme
route.delete("/deleteTheme", checkPermission(MODULES.STORE_THEMES), checkAccessWithSecretKey(), ThemeController.deleteTheme);

//get themes dropdown
route.get("/fetchThemeDropdown", checkAccessWithSecretKey(), ThemeController.fetchThemeDropdown);

module.exports = route;
