//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const AgencyCommissionController = require("../../controllers/admin/agencyCommission.controller");

//create agency commission record
route.post("/createAgencyCommission", checkAccessWithSecretKey(), AgencyCommissionController.createAgencyCommission);

//update an agency commission record
route.patch("/updateAgencyCommission", checkAccessWithSecretKey(), AgencyCommissionController.updateAgencyCommission);

//delete an agency commission record
route.delete("/deleteAgencyCommission", checkAccessWithSecretKey(), AgencyCommissionController.deleteAgencyCommission);

//fetch all agency commission records
route.get("/fetchAllAgencyCommissions", checkAccessWithSecretKey(), AgencyCommissionController.fetchAllAgencyCommissions);

module.exports = route;
