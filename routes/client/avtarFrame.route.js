//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const AvtarFrameController = require("../../controllers/client/avtarFrame.controller");

//Get Avatar Frames
route.get("/listAvatarFrames", checkAccessWithSecretKey(), AvtarFrameController.listAvatarFrames);

module.exports = route;
