//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const FollowerFollowingController = require("../../controllers/admin/followerFollowing.controller");

//get the friend list (users who follow each other)
route.get("/fetchUserFriends", checkAccessWithSecretKey(), FollowerFollowingController.fetchUserFriends);

//get the following list (users whom I follow)
route.get("/fetchUserFollowing", checkAccessWithSecretKey(), FollowerFollowingController.fetchUserFollowing);

//get the followers list (users who follow me)
route.get("/fetchUserFollowers", checkAccessWithSecretKey(), FollowerFollowingController.fetchUserFollowers);

module.exports = route;
