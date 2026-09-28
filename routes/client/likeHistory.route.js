//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const LikeHistoryController = require("../../controllers/client/likeHistory.controller");

//like or dislike of post by user
route.post("/togglePostLikeStatus", checkAccessWithSecretKey(), LikeHistoryController.togglePostLikeStatus);

//toggling like/dislike on a video
route.post("/toggleVideoLikeStatus", checkAccessWithSecretKey(), LikeHistoryController.toggleVideoLikeStatus);

module.exports = route;
