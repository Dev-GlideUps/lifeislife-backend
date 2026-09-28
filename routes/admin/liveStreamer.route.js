//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const LiveStreamerController = require("../../controllers/admin/liveStreamer.controller");

//get live countries list
route.get("/fetchActiveLiveCountries", checkAccessWithSecretKey(), LiveStreamerController.fetchActiveLiveCountries);

//get overall dashboard stats
route.get("/fetchLiveStreamsSummary", checkAccessWithSecretKey(), LiveStreamerController.fetchLiveStreamsSummary);

//get live user list
route.get("/fetchLiveStreams", checkAccessWithSecretKey(), LiveStreamerController.fetchLiveStreams);

//single live stream details by liveUserObjId
route.get("/fetchLiveStreamById", checkAccessWithSecretKey(), LiveStreamerController.fetchLiveStreamById);

//check whether a user is live for a given session
route.get("/fetchUserLiveStatus", checkAccessWithSecretKey(), LiveStreamerController.fetchUserLiveStatus);

//all users' live session history (paginated, full fields incl. duration)
route.get("/fetchAllLiveSessionHistory", checkAccessWithSecretKey(), LiveStreamerController.fetchAllLiveSessionHistory);

//live end
route.patch("/terminateLiveStream", checkAccessWithSecretKey(), LiveStreamerController.terminateLiveStream);

//remove audio-room participant from seat (admin; mirrors socket participantRemoved)
route.patch("/removeLiveParticipant", checkAccessWithSecretKey(), LiveStreamerController.removeLiveParticipant);

//ban live user
route.patch("/banLiveUser", checkAccessWithSecretKey(), LiveStreamerController.banLiveUser);

//unban live user
route.patch("/unbanLiveUser", checkAccessWithSecretKey(), LiveStreamerController.unbanLiveUser);

//get live banned users
route.get("/fetchBannedLiveUsers", checkAccessWithSecretKey(), LiveStreamerController.fetchBannedLiveUsers);

module.exports = route;
