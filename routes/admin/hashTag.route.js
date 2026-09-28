//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const HashTagController = require("../../controllers/admin/hashTag.controller");

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

//craete hashTag
route.post("/addNewHashtag", checkPermission(MODULES.HASHTAGS), checkAccessWithSecretKey(), HashTagController.addNewHashtag);

//update hashTag
route.patch("/modifyHashtag", checkPermission(MODULES.HASHTAGS), checkAccessWithSecretKey(), HashTagController.modifyHashtag);

//get hashTag statistics
route.get("/fetchHashTagStatistics", checkPermission(MODULES.HASHTAGS), checkAccessWithSecretKey(), HashTagController.fetchHashTagStatistics);

//get hashTags
route.get("/retrieveHashtags", checkPermission(MODULES.HASHTAGS), checkAccessWithSecretKey(), HashTagController.retrieveHashtags);

//delete hashTag
route.delete("/removeHashtag", checkPermission(MODULES.HASHTAGS), checkAccessWithSecretKey(), HashTagController.removeHashtag);

//get hashTags ( dropdown )
route.get("/listHashtags", checkAccessWithSecretKey(), HashTagController.listHashtags);

module.exports = route;
