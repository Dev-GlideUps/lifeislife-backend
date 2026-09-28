//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const CommentController = require("../../controllers/admin/comment.controller");

//get post or video's comment
route.get("/getComments", checkAccessWithSecretKey(), CommentController.getComments);

//delete post or video's comment
route.delete("/deleteComment", checkAccessWithSecretKey(), CommentController.deleteComment);

module.exports = route;
