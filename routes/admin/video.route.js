//express
const express = require("express");
const route = express.Router();

//multer
const multer = require("multer");
const storage = require("../../util/multer");
const upload = multer({ storage });

const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const VideoController = require("../../controllers/admin/video.controller");

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

//upload video
route.post(
  "/uploadVideo",
  checkPermission(MODULES.SOCIAL_MEDIA_VIDEOS),
  checkAccessWithSecretKey(),
  upload.fields([
    { name: "videoImage", maxCount: 5 },
    { name: "videoUrl", maxCount: 5 },
  ]),
  VideoController.uploadVideo,
);

//update video
route.patch(
  "/updateVideoData",
  checkPermission(MODULES.SOCIAL_MEDIA_VIDEOS),
  checkAccessWithSecretKey(),
  upload.fields([
    { name: "videoImage", maxCount: 5 },
    { name: "videoUrl", maxCount: 5 },
  ]),
  VideoController.updateVideoData,
);

//get video statistics
route.get("/fetchVideoStatistics", checkPermission(MODULES.SOCIAL_MEDIA_VIDEOS), checkAccessWithSecretKey(), VideoController.fetchVideoStatistics);

//get real or fake videos
route.get("/fetchVideos", checkPermission(MODULES.SOCIAL_MEDIA_VIDEOS), checkAccessWithSecretKey(), VideoController.fetchVideos);

//get user's videos
route.get("/getUserMediaLibrary", checkPermission(MODULES.SOCIAL_MEDIA_VIDEOS), checkAccessWithSecretKey(), VideoController.getUserMediaLibrary);

//delete video
route.delete("/removeVideoFromLibrary", checkPermission(MODULES.SOCIAL_MEDIA_VIDEOS), checkAccessWithSecretKey(), VideoController.removeVideoFromLibrary);

module.exports = route;
