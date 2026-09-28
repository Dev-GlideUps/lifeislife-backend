//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const ProfileVisitorController = require("../../controllers/admin/profileVisitor.controller");

//get the list of users who visited my profile
route.get("/fetchProfileVisitors", checkAccessWithSecretKey(), ProfileVisitorController.fetchProfileVisitors);

//get the list of profiles visited by the authenticated user
route.get("/fetchVisitedProfiles", checkAccessWithSecretKey(), ProfileVisitorController.fetchVisitedProfiles);

module.exports = route;
