//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const beautyEffectController = require("../../controllers/client/beautyEffect.controller");

// Get Beauty Effects
route.get("/fetchBeautyEffects", checkAccessWithSecretKey(), beautyEffectController.fetchBeautyEffects);

module.exports = route;
