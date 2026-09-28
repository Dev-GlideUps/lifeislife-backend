//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const BannerController = require("../../controllers/admin/banner.controller");

//multer
const multer = require("multer");
const storage = require("../../util/multer");
const upload = multer({ storage });

//create Banner
route.post("/createNewBanner", checkAccessWithSecretKey(), upload.single("imageUrl"), BannerController.createNewBanner);

//update Banner
route.patch("/modifyBannerDetails", checkAccessWithSecretKey(), upload.single("imageUrl"), BannerController.modifyBannerDetails);

//toggle Banner Active Status
route.patch("/toggleBannerActiveState", checkAccessWithSecretKey(), BannerController.toggleBannerActiveState);

//remove Banner
route.delete("/removeBanner", checkAccessWithSecretKey(), BannerController.removeBanner);

//fetch Banners (filtered by bannerType)
route.get("/fetchBannerList", checkAccessWithSecretKey(), BannerController.fetchBannerList);

module.exports = route;
