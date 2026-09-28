//express
const express = require("express");
const route = express.Router();

//multer
const multer = require("multer");
const storage = require("../../util/multer");
const upload = multer({ storage });

const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const songController = require("../../controllers/admin/song.controller");

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

//create song
route.post(
  "/addSong",
  checkPermission(MODULES.SONGS_LIST),
  checkAccessWithSecretKey(),
  upload.fields([
    { name: "songImage", maxCount: 1 },
    { name: "songLink", maxCount: 1 },
  ]),
  songController.addSong,
);

//update song
route.patch(
  "/modifySong",
  checkPermission(MODULES.SONGS_LIST),
  checkAccessWithSecretKey(),
  upload.fields([
    { name: "songImage", maxCount: 1 },
    { name: "songLink", maxCount: 1 },
  ]),
  songController.modifySong,
);

//get songs
route.get("/fetchSongs", checkPermission(MODULES.SONGS_LIST), checkAccessWithSecretKey(), songController.fetchSongs);

//delete song
route.delete("/removeSong", checkPermission(MODULES.SONGS_LIST), checkAccessWithSecretKey(), songController.removeSong);

module.exports = route;
