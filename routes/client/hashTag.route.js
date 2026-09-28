//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const HashTagController = require("../../controllers/client/hashTag.controller");

//retrive hashTag (when add the video/post by user)
route.get("/getHashtags", checkAccessWithSecretKey(), HashTagController.getHashtags);

//get most used hashTag
route.get("/getTopTrendingHashtags", checkAccessWithSecretKey(), HashTagController.getTopTrendingHashtags);

//get hashTag wise post
route.get("/retrieveHashtagPosts", checkAccessWithSecretKey(), HashTagController.retrieveHashtagPosts);

module.exports = route;
