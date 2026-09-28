//express
const express = require("express");
const route = express.Router();

const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const SongCategoryController = require("../../controllers/client/songCategory.controller");

//get songCategories
route.get("/listSongCategories", checkAccessWithSecretKey(), SongCategoryController.listSongCategories);

module.exports = route;
