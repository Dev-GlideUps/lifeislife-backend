const express = require("express");
const route = express.Router();

//multer
const multer = require("multer");
const storage = require("../../util/multer");
const upload = multer({ storage });

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

const HostLevelController = require("../../controllers/admin/hostLevel.controller");

//create host level
route.post("/addHostLevel", checkAccessWithSecretKey(), upload.single("image"), HostLevelController.addHostLevel);

//update host level
route.patch("/editHostLevel", checkAccessWithSecretKey(), upload.single("image"), HostLevelController.editHostLevel);

//delete host level
route.delete("/removeHostLevel", checkAccessWithSecretKey(), HostLevelController.removeHostLevel);

//get host levels
route.get("/fetchHostLevels", checkAccessWithSecretKey(), HostLevelController.fetchHostLevels);

module.exports = route;
