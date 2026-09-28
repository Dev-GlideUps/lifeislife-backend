//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const FollowerFollowingController = require("../../controllers/client/followerFollowing.controller");

//validate user's access token
const validateUserToken = require("../../middleware/validateUserToken.middleware");

//follow or unfollow the user
route.post("/followUnfollow", validateUserToken, checkAccessWithSecretKey(), FollowerFollowingController.followUnfollow);

//retrieves friends, following, and followers
route.get("/getSocialLists", validateUserToken, checkAccessWithSecretKey(), FollowerFollowingController.getSocialLists);

//retrieves tousers's friends, following, and followers
route.get("/fetchUserSocialConnections", validateUserToken, checkAccessWithSecretKey(), FollowerFollowingController.fetchUserSocialConnections);

//get the friend list (users who follow each other)
route.get("/getFriendsList", validateUserToken, checkAccessWithSecretKey(), FollowerFollowingController.getFriendsList);

//get the following list (users whom I follow)
route.get("/getFollowingList", validateUserToken, checkAccessWithSecretKey(), FollowerFollowingController.getFollowingList);

//get the followers list (users who follow me)
route.get("/getFollowersList", validateUserToken, checkAccessWithSecretKey(), FollowerFollowingController.getFollowersList);

module.exports = route;
