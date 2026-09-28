//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const GiftController = require("../../controllers/admin/gift.controller");

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

//multer
const multer = require("multer");
const storage = require("../../util/multer");
const upload = multer({ storage });

//create gift
route.post(
  "/createGift",
  checkPermission(MODULES.GIFTS),
  checkAccessWithSecretKey(),
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "svgaImage", maxCount: 1 },
  ]),
  GiftController.createGift,
);

//update gift
route.patch(
  "/updateGift",
  checkPermission(MODULES.GIFTS),
  checkAccessWithSecretKey(),
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "svgaImage", maxCount: 1 },
  ]),
  GiftController.updateGift,
);

//get gifts
route.get("/getGifts", checkPermission(MODULES.GIFTS), checkAccessWithSecretKey(), GiftController.getGifts);

//gift analytics (most popular + revenue by gift)
route.get("/fetchGiftAnalytics", checkPermission(MODULES.GIFTS), checkAccessWithSecretKey(), GiftController.fetchGiftAnalytics);

//delete gift
route.delete("/deleteGift", checkPermission(MODULES.GIFTS), checkAccessWithSecretKey(), GiftController.deleteGift);

module.exports = route;
