//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const AvtarFrameController = require("../../controllers/admin/avtarFrame.controller");

//multer
const multer = require("multer");
const storage = require("../../util/multer");
const upload = multer({ storage });

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

//Create Avatar Frame
route.post(
  "/createAvtarFrame",
  checkPermission(MODULES.STORE_FRAMES),
  checkAccessWithSecretKey(),
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "svgaImage", maxCount: 1 },
  ]),
  AvtarFrameController.createAvtarFrame,
);

//Update Avatar Frame
route.patch(
  "/updateAvtarFrame",
  checkPermission(MODULES.STORE_FRAMES),
  checkAccessWithSecretKey(),
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "svgaImage", maxCount: 1 },
  ]),
  AvtarFrameController.updateAvtarFrame,
);

//toggling avatar frame isActive status
route.patch("/toggleAvtarFrameStatus", checkPermission(MODULES.STORE_FRAMES), checkAccessWithSecretKey(), AvtarFrameController.toggleAvtarFrameStatus);

//toggling avatar frame recommendation
route.patch("/toggleAvtarFrameRecommendation", checkPermission(MODULES.STORE_FRAMES), checkAccessWithSecretKey(), AvtarFrameController.toggleAvtarFrameRecommendation);

//Get Avatar Frames
route.get("/getAvtarFrames", checkPermission(MODULES.STORE_FRAMES), checkAccessWithSecretKey(), AvtarFrameController.getAvtarFrames);

//Delete Avatar Frame
route.delete("/deleteAvtarFrame", checkPermission(MODULES.STORE_FRAMES), checkAccessWithSecretKey(), AvtarFrameController.deleteAvtarFrame);

//Get avatar frames dropdown
route.get("/fetchAvatarFrameDropdown", checkPermission(MODULES.STORE_FRAMES), checkAccessWithSecretKey(), AvtarFrameController.fetchAvatarFrameDropdown);

module.exports = route;
