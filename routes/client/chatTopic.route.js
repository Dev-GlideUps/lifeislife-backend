//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const ChatTopicController = require("../../controllers/client/chatTopic.controller");

//get thumb list of chat between users
route.get("/fetchChatList", checkAccessWithSecretKey(), ChatTopicController.fetchChatList);

//search for chat participants by their name or username within existing chat topics
route.get("/findChatUserBySearch", checkAccessWithSecretKey(), ChatTopicController.findChatUserBySearch);

module.exports = route;
