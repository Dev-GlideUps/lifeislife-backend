//express
const express = require("express");
const route = express.Router();

const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const settingController = require("../../controllers/admin/setting.controller");

//multer
const multer = require("multer");
const storage = require("../../util/multer");
const upload = multer({ storage });

//validate admin's access token
const validateAdminToken = require("../../middleware/verifyAdminAuthToken.middleware");

//update setting
route.patch("/modifySetting", validateAdminToken, checkAccessWithSecretKey(), settingController.modifySetting);

//get setting
route.get("/fetchSetting", validateAdminToken, checkAccessWithSecretKey(), settingController.fetchSetting);

//update setting switch
route.patch("/modifySettingToggle", validateAdminToken, checkAccessWithSecretKey(), settingController.modifySettingToggle);

//manage user profile image list
route.patch("/updateProfilePhotoList", validateAdminToken, checkAccessWithSecretKey(), upload.any(), settingController.updateProfilePhotoList);

//fake audio call audios
route.patch("/updateFakeAudioCallAudioList", validateAdminToken, checkAccessWithSecretKey(), upload.any(), settingController.updateFakeAudioCallAudioList);

//fake video call videos
route.patch("/updateFakeVideoCallVideoList", validateAdminToken, checkAccessWithSecretKey(), upload.any(), settingController.updateFakeVideoCallVideoList);

//create game
route.patch("/addGame", validateAdminToken, checkAccessWithSecretKey(), upload.single("image"), settingController.addGame);

//edit game
route.patch("/modifyGame", validateAdminToken, checkAccessWithSecretKey(), upload.single("image"), settingController.modifyGame);

//game status handle
route.patch("/toggleGameStatus", validateAdminToken, checkAccessWithSecretKey(), settingController.toggleGameStatus);

//remove game
route.delete("/removeGame", validateAdminToken, checkAccessWithSecretKey(), settingController.removeGame);

//update game coin
route.patch("/modifyGameCoin", validateAdminToken, checkAccessWithSecretKey(), settingController.modifyGameCoin);

//get game setting
route.get("/retrieveGameSettings", checkAccessWithSecretKey(), settingController.retrieveGameSettings);

//get lucky gift pool (luckyGiftTargetCoin only)
route.get("/getLuckyGiftTargetCoin", validateAdminToken, checkAccessWithSecretKey(), settingController.getLuckyGiftTargetCoin);

//reset lucky gift pool (luckyGiftTargetCoin → 0)
route.patch("/resetLuckyGiftTargetCoin", validateAdminToken, checkAccessWithSecretKey(), settingController.resetLuckyGiftTargetCoin);

module.exports = route;
