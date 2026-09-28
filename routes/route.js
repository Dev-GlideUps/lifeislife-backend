//express
const express = require("express");
const route = express.Router();

//admin index.js
const admin = require("./admin/route");

//client index.js
const client = require("./client/route");

//agency index.js
const agency = require("./agency/route");

//host index.js
const host = require("./host/route");

route.use("/admin", admin);
route.use("/client", client);
route.use("/agency", agency);
route.use("/host", host);

module.exports = route;
