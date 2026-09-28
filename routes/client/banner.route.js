//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const BannerController = require("../../controllers/client/banner.controller");

//fetch Banners (filtered by bannerType)
route.get("/retrieveBannerList", checkAccessWithSecretKey(), BannerController.retrieveBannerList);

module.exports = route;
