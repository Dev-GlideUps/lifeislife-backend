//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const CommentController = require("../../controllers/client/comment.controller");

//add comment of particular post or video
route.post("/addCommentToMedia", checkAccessWithSecretKey(), CommentController.addCommentToMedia);

//get comments for particular video or post
route.get("/fetchMediaComments", checkAccessWithSecretKey(), CommentController.fetchMediaComments);

module.exports = route;
