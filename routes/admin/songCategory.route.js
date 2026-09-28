//express
const express = require("express");
const route = express.Router();

//multer
const multer = require("multer");
const storage = require("../../util/multer");
const upload = multer({ storage });

const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const songCategoryController = require("../../controllers/admin/songCategory.controller");

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

//create songCategory
route.post("/createSongCategory", checkPermission(MODULES.SONGS_CATEGORIES), checkAccessWithSecretKey(), upload.single("image"), songCategoryController.createSongCategory);

//update songCategory
route.patch("/modifySongCategory", checkPermission(MODULES.SONGS_CATEGORIES), checkAccessWithSecretKey(), upload.single("image"), songCategoryController.modifySongCategory);

//get songCategories
route.get("/fetchAllSongCategories", checkPermission(MODULES.SONGS_CATEGORIES), checkAccessWithSecretKey(), songCategoryController.fetchAllSongCategories);

//delete songCategory
route.delete("/removeSongCategory", checkPermission(MODULES.SONGS_CATEGORIES), checkAccessWithSecretKey(), songCategoryController.removeSongCategory);

module.exports = route;
