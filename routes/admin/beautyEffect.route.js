//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const beautyEffectController = require("../../controllers/admin/beautyEffect.controller");

//multer
const multer = require("multer");
const storage = require("../../util/multer");
const upload = multer({ storage });

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

// Create Beauty Effect
route.post(
  "/createBeautyEffect",
  checkPermission(MODULES.BEAUTY_EFFECT),
  checkAccessWithSecretKey(),
  upload.fields([
    { name: "icon", maxCount: 1 },
    { name: "effect", maxCount: 1 },
  ]),
  beautyEffectController.createBeautyEffect,
);

// Update Beauty Effect
route.patch(
  "/updateBeautyEffect",
  checkPermission(MODULES.BEAUTY_EFFECT),
  checkAccessWithSecretKey(),
  upload.fields([
    { name: "icon", maxCount: 1 },
    { name: "effect", maxCount: 1 },
  ]),
  beautyEffectController.updateBeautyEffect,
);

// Get Beauty Effects
route.get("/getBeautyEffects", checkPermission(MODULES.BEAUTY_EFFECT), checkAccessWithSecretKey(), beautyEffectController.getBeautyEffects);

// Enable / Disable Beauty Effect
route.patch("/toggleBeautyEffectStatus", checkPermission(MODULES.BEAUTY_EFFECT), checkAccessWithSecretKey(), beautyEffectController.toggleBeautyEffectStatus);

// Delete Beauty Effect
route.delete("/deleteBeautyEffect", checkPermission(MODULES.BEAUTY_EFFECT), checkAccessWithSecretKey(), beautyEffectController.deleteBeautyEffect);

module.exports = route;
