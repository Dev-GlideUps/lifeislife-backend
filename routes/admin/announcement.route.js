//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const AnnouncementController = require("../../controllers/admin/announcement.controller");

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

//multer
const multer = require("multer");
const storage = require("../../util/multer");
const upload = multer({ storage });

// create announcement
route.post(
  "/createAnnouncement",
  checkPermission(MODULES.ANNOUNCEMENTS),
  checkAccessWithSecretKey(),
  upload.fields([
    { name: "media", maxCount: 1 },
    { name: "thumbnail", maxCount: 1 },
  ]),
  AnnouncementController.createAnnouncement,
);

// list announcements
route.get("/fetchAnnouncementList", checkPermission(MODULES.ANNOUNCEMENTS), checkAccessWithSecretKey(), AnnouncementController.fetchAnnouncementList);

// toggle active announcement
route.patch("/toggleAnnouncementActiveState", checkPermission(MODULES.ANNOUNCEMENTS), checkAccessWithSecretKey(), AnnouncementController.toggleAnnouncementActiveState);

// delete announcement
route.delete("/removeAnnouncement", checkPermission(MODULES.ANNOUNCEMENTS), checkAccessWithSecretKey(), AnnouncementController.removeAnnouncement);

module.exports = route;
