//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const AnnouncementController = require("../../controllers/client/announcement.controller");

// fetch announcements (user token will be applied in routes/client/route.js)
route.get("/fetchAnnouncements", checkAccessWithSecretKey(), AnnouncementController.fetchAnnouncements);

module.exports = route;

