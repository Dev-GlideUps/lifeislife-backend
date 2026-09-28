//express
const express = require("express");
const route = express.Router();

//multer
const multer = require("multer");
const storage = require("../../util/multer");
const upload = multer({ storage });

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const HelpController = require("../../controllers/client/help.controller");

//submit help
route.post("/submitUserHelp", checkAccessWithSecretKey(), upload.single("image"), HelpController.submitUserHelp);

//get helps
route.get("/fetchHelpData", checkAccessWithSecretKey(), HelpController.fetchHelpData);

module.exports = route;
