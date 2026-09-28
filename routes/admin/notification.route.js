//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const AdminNotification = require("../../controllers/admin/notification.controller");

//multer
const multer = require("multer");
const storage = require("../../util/multer");
const upload = multer({ storage });

// Send Notification to Users by Role
route.post("/sendNotifications", checkAccessWithSecretKey(), upload.single("image"), AdminNotification.sendNotifications);

// Send Notification to a Single Role
route.post("/sendSingleNotification", checkAccessWithSecretKey(), upload.single("image"), AdminNotification.sendSingleNotification);

module.exports = route;
