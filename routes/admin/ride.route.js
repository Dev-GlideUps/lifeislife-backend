//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const RideController = require("../../controllers/admin/ride.controller");

//multer
const multer = require("multer");
const storage = require("../../util/multer");
const upload = multer({ storage });

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

//create ride
route.post(
  "/addRide",
  checkPermission(MODULES.STORE_RIDES),
  checkAccessWithSecretKey(),
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "svgaImage", maxCount: 1 },
  ]),
  RideController.addRide,
);

//update ride
route.patch(
  "/modifyRide",
  checkPermission(MODULES.STORE_RIDES),
  checkAccessWithSecretKey(),
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "svgaImage", maxCount: 1 },
  ]),
  RideController.modifyRide,
);

//toggling the isActive status of a Ride
route.patch("/toggleRideStatus", checkPermission(MODULES.STORE_RIDES), checkAccessWithSecretKey(), RideController.toggleRideStatus);

//toggling ride recommendation
route.patch("/toggleRideRecommendation", checkPermission(MODULES.STORE_RIDES), checkAccessWithSecretKey(), RideController.toggleRideRecommendation);

//get all rides
route.get("/fetchRides", checkPermission(MODULES.STORE_RIDES), checkAccessWithSecretKey(), RideController.fetchRides);

//delete ride
route.delete("/removeRide", checkPermission(MODULES.STORE_RIDES), checkAccessWithSecretKey(), RideController.removeRide);

//get rides dropdown
route.get("/fetchRideDropdown",  checkAccessWithSecretKey(), RideController.fetchRideDropdown);

module.exports = route;
