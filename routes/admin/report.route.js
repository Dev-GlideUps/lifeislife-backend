//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const ReportController = require("../../controllers/admin/report.controller");

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

//get report statistics
route.get("/fetchReportStatistics", checkPermission(MODULES.REPORTS), checkAccessWithSecretKey(), ReportController.fetchReportStatistics);

//get type wise reports
route.get("/fetchReports", checkPermission(MODULES.REPORTS), checkAccessWithSecretKey(), ReportController.fetchReports);

//report solved
route.patch("/resolveReport", checkPermission(MODULES.REPORTS), checkAccessWithSecretKey(), ReportController.resolveReport);

//delete report
route.delete("/removeReport", checkPermission(MODULES.REPORTS), checkAccessWithSecretKey(), ReportController.removeReport);

module.exports = route;
