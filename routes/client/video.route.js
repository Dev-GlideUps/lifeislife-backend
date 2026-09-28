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
const VideoController = require("../../controllers/client/video.controller");

//upload video by user
route.post("/broadcastVideo", checkAccessWithSecretKey(), upload.fields([{ name: "videoImage" }, { name: "videoUrl" }]), VideoController.broadcastVideo);

//update video by user
route.patch("/modifyVideoDetails", checkAccessWithSecretKey(), upload.single("videoImage"), VideoController.modifyVideoDetails);

//get user's videos
route.get("/userVideoLibrary", checkAccessWithSecretKey(), VideoController.userVideoLibrary);

//delete video of user
route.delete("/deleteUserVideo", checkAccessWithSecretKey(), VideoController.deleteUserVideo);

//user share video
route.patch("/boostVideoShares", checkAccessWithSecretKey(), VideoController.boostVideoShares);

//get videos
route.get("/retrieveVideoCollection", checkAccessWithSecretKey(), VideoController.retrieveVideoCollection);

//get particular song's videos
route.get("/fetchSongVideos", checkAccessWithSecretKey(), VideoController.fetchSongVideos);

//get videos where the logged-in user is mentioned
route.get("/listMentionedVideos", checkAccessWithSecretKey(), VideoController.listMentionedVideos);

module.exports = route;
