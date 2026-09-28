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
const PostController = require("../../controllers/client/post.controller");

//upload post by user
route.post("/publishPost", checkAccessWithSecretKey(), upload.fields([{ name: "postImage", maxCount: 5 }]), PostController.publishPost);

//update post by user
route.patch("/editUserPost", checkAccessWithSecretKey(), PostController.editUserPost);

//get user's posts
route.get("/getUserPosts", checkAccessWithSecretKey(), PostController.getUserPosts);

//delete post of user
route.delete("/removeUserPost", checkAccessWithSecretKey(), PostController.removeUserPost);

//user share post
route.patch("/incrementPostShareCount", checkAccessWithSecretKey(), PostController.incrementPostShareCount);

//get posts
route.get("/getPostsList", checkAccessWithSecretKey(), PostController.getPostsList);

//get follower's post
route.get("/retrieveFollowerPosts", checkAccessWithSecretKey(), PostController.retrieveFollowerPosts);

//get posts where the logged-in user is mentioned
route.get("/getMentionedPosts", checkAccessWithSecretKey(), PostController.getMentionedPosts);

module.exports = route;
