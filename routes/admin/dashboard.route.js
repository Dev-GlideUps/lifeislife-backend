//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const DashboardController = require("../../controllers/admin/dashboard.controller");

//get dashboard count
route.get("/dashboardMetrics", checkAccessWithSecretKey(), DashboardController.dashboardMetrics);

//get chat analytic
route.get("/fetchGraphStats", checkAccessWithSecretKey(), DashboardController.fetchGraphStats);

//get new user
route.get("/retrieveRecentUsers", checkAccessWithSecretKey(), DashboardController.retrieveRecentUsers);

//get top spenders
route.get("/fetchTopContributors", checkAccessWithSecretKey(), DashboardController.fetchTopContributors);

//get top likers
route.get("/fetchTopLikers", checkAccessWithSecretKey(), DashboardController.fetchTopLikers);

//get reported profiles
route.get("/fetchReportedProfiles", checkAccessWithSecretKey(), DashboardController.fetchReportedProfiles);

//get blocked users
route.get("/fetchBlockedUsers", checkAccessWithSecretKey(), DashboardController.fetchBlockedUsers);

//get top hosts
route.get("/getHighestEarningHosts", checkAccessWithSecretKey(), DashboardController.getHighestEarningHosts);

//get top agency
route.get("/getHighestPerformingAgencies", checkAccessWithSecretKey(), DashboardController.getHighestPerformingAgencies);

module.exports = route;
