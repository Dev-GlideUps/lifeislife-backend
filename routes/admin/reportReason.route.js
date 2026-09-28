//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const ReportReasonController = require("../../controllers/admin/reportReason.controller");

//create reportReason
route.post("/addReportReason", checkAccessWithSecretKey(), ReportReasonController.addReportReason);

//update reportReason
route.patch("/modifyReportReason", checkAccessWithSecretKey(), ReportReasonController.modifyReportReason);

//get reportReason
route.get("/fetchReportReason", checkAccessWithSecretKey(), ReportReasonController.fetchReportReason);

//delete reportReason
route.delete("/removeReportReason", checkAccessWithSecretKey(), ReportReasonController.removeReportReason);

module.exports = route;
