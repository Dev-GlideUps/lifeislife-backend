//express
const express = require("express");
const route = express.Router();

const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const SongController = require("../../controllers/client/song.controller");

//get songs (when upload video by the user)
route.get("/fetchSongs", checkAccessWithSecretKey(), SongController.fetchSongs);

//song favorite by user
route.post("/handleUserFavoriteSong", checkAccessWithSecretKey(), SongController.handleUserFavoriteSong);

//get favorite songs (when upload video by the user) (favorite by user)
route.get("/retrieveFavoriteSongs", checkAccessWithSecretKey(), SongController.retrieveFavoriteSongs);

//search songs by user
route.get("/findSongs", checkAccessWithSecretKey(), SongController.findSongs);

//get category wise songs
route.get("/fetchSongsByCategory", checkAccessWithSecretKey(), SongController.fetchSongsByCategory);

module.exports = route;
