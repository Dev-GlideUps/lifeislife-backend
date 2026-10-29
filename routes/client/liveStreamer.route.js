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
const LiveStreamerController = require("../../controllers/client/liveStreamer.controller");

//validate user's access token
const validateUserToken = require("../../middleware/validateUserToken.middleware");

//live user ( video live / pk battle )
route.post("/startLiveStream", validateUserToken, checkAccessWithSecretKey(), LiveStreamerController.startLiveStream);

//live user ( audio live )
route.post("/initializeLiveStream", validateUserToken, checkAccessWithSecretKey(), upload.single("roomImage"), LiveStreamerController.initializeLiveStream);

//update audio room info
route.patch("/updateAudioRoomInfo", validateUserToken, checkAccessWithSecretKey(), upload.single("roomImage"), LiveStreamerController.updateAudioRoomInfo);

//get live user list
route.get("/fetchLiveStreamers", validateUserToken, checkAccessWithSecretKey(), LiveStreamerController.fetchLiveStreamers);

//get available users to send pk request ( pk battle )
route.get("/getAvailableLiveUsers", validateUserToken, checkAccessWithSecretKey(), LiveStreamerController.getAvailableLiveUsers);

//search a host by uniqueId with pk availability ( pk battle )
route.get("/searchPkHost", validateUserToken, checkAccessWithSecretKey(), LiveStreamerController.searchPkHost);

//recent pk opponents for a one-tap rematch ( pk battle )
route.get("/recentPkOpponents", validateUserToken, checkAccessWithSecretKey(), LiveStreamerController.recentPkOpponents);

//get available users to invite user ( audio live )
route.get("/getAvailableUsersForInvite", validateUserToken, checkAccessWithSecretKey(), LiveStreamerController.getAvailableUsersForInvite);

//retrieves list of users currently occupying seats ( audio live )
route.get("/fetchSeatedUsersList", checkAccessWithSecretKey(), LiveStreamerController.fetchSeatedUsersList);

//get block users list ( audio live )
route.get("/fetchBlockedUsersList", checkAccessWithSecretKey(), LiveStreamerController.fetchBlockedUsersList);

//get live summary
route.get("/getLiveSummaryDetails", checkAccessWithSecretKey(), LiveStreamerController.getLiveSummaryDetails);

//find the user with an active audio session
route.get("/exitAudioSession", validateUserToken, checkAccessWithSecretKey(), LiveStreamerController.exitAudioSession);

//delete user's audio room
route.delete("/stopAudioSession", validateUserToken, checkAccessWithSecretKey(), LiveStreamerController.stopAudioSession);

//get admin list (Audio Live)
route.get("/fetchAdminUsersList", validateUserToken, checkAccessWithSecretKey(), LiveStreamerController.fetchAdminUsersList);

//get live countries list
route.get("/fetchLiveCountries", checkAccessWithSecretKey(), LiveStreamerController.fetchLiveCountries);

module.exports = route;
