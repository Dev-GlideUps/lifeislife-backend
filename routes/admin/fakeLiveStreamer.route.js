//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const FakeLiveStreamerController = require("../../controllers/admin/fakeLiveStreamer.controller");

//multer
const multer = require("multer");
const storage = require("../../util/multer");
const upload = multer({ storage });

//create fake liveStreame
route.post(
  "/registerFakeUserWithStream",
  checkAccessWithSecretKey(),
  upload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "pkThumbnails", maxCount: 2 },
    { name: "streamSource", maxCount: 1 },
    { name: "pkStreamSources", maxCount: 2 },
    { name: "multiLiveThumbnails", maxCount: 10 },
    { name: "multiLiveStreamSources", maxCount: 10 },
  ]),
  FakeLiveStreamerController.registerFakeUserWithStream
);

//update fake liveStreamer
route.patch(
  "/updateFakeUserStream",
  checkAccessWithSecretKey(),
  upload.fields([
    { name: "thumbnail", maxCount: 1 },
    { name: "pkThumbnails", maxCount: 2 },
    { name: "streamSource", maxCount: 1 },
    { name: "pkStreamSources", maxCount: 2 },
    { name: "multiLiveThumbnails", maxCount: 10 },
    { name: "multiLiveStreamSources", maxCount: 10 },
  ]),
  FakeLiveStreamerController.updateFakeUserStream
);

//toggles the isStreaming status for the fakeLiveStreamer
route.patch("/toggleStreamerStreamingStatus", checkAccessWithSecretKey(), FakeLiveStreamerController.toggleStreamerStreamingStatus);

//get fake liveStreamer
route.get("/getFakeLiveStreamers", checkAccessWithSecretKey(), FakeLiveStreamerController.getFakeLiveStreamers);

//delete fake liveStreamer
route.delete("/deleteFakeLiveStreamer", checkAccessWithSecretKey(), FakeLiveStreamerController.deleteFakeLiveStreamer);

module.exports = route;
