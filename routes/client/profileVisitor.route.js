//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const ProfileVisitorController = require("../../controllers/client/profileVisitor.controller");

//profile visit of the user
route.post("/recordProfileVisit", checkAccessWithSecretKey(), ProfileVisitorController.recordProfileVisit);

//retrieves both profile visitors and visited profiles
route.get("/fetchVisitedProfilesAndVisitors", checkAccessWithSecretKey(), ProfileVisitorController.fetchVisitedProfilesAndVisitors);

//get the list of users who visited my profile
route.get("/getProfileVisitors", checkAccessWithSecretKey(), ProfileVisitorController.getProfileVisitors);

//get the list of profiles visited by the authenticated user
route.get("/getVisitedProfiles", checkAccessWithSecretKey(), ProfileVisitorController.getVisitedProfiles);

module.exports = route;
