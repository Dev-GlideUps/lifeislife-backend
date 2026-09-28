//express
const express = require("express");
const route = express.Router();

//require agency's route.js
const agency = require("./agency.route");
const hostApplication = require("./hostApplicaton.route");
const host = require("./host.route");
const history = require("./history.route");
const agencyCommission = require("./agencyCommission.route");
const payoutRequest = require("./payoutRequest.route");
const payoutMethod = require("./payoutMethod.route");
const setting = require("./setting.route");

//exports agency's route.js
route.use("/", agency);
route.use("/hostApplication", hostApplication);
route.use("/host", host);
route.use("/history", history);
route.use("/agencyCommission", agencyCommission);
route.use("/payoutRequest", payoutRequest);
route.use("/payoutMethod", payoutMethod);
route.use("/setting", setting);

module.exports = route;
