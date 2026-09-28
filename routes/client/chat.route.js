//express
const express = require("express");
const route = express.Router();

//multer
const multer = require("multer");
const storage = require("../../util/multer");
const upload = multer({ storage });

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const ChatController = require("../../controllers/client/chat.controller");

//send message ( image or audio )
route.post(
  "/sendChatMessage",
  checkAccessWithSecretKey(),
  upload.fields([
    { name: "image", maxCount: 1 },
    { name: "audio", maxCount: 1 },
  ]),
  ChatController.sendChatMessage
);

//get old chat between users
route.get("/fetchChatHistory", checkAccessWithSecretKey(), ChatController.fetchChatHistory);

module.exports = route;
