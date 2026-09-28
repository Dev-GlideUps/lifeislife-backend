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
const PostController = require("../../controllers/admin/post.controller");

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

//upload post
route.post("/uploadAdminFakePost", checkPermission(MODULES.SOCIAL_MEDIA_POSTS), checkAccessWithSecretKey(), upload.fields([{ name: "postImage", maxCount: 5 }]), PostController.uploadAdminFakePost);

//update post
route.patch("/modifyPost", checkPermission(MODULES.SOCIAL_MEDIA_POSTS), checkAccessWithSecretKey(), upload.fields([{ name: "postImage", maxCount: 5 }]), PostController.modifyPost);

//get post statistics
route.get("/fetchPostStatistics", checkPermission(MODULES.SOCIAL_MEDIA_POSTS), checkAccessWithSecretKey(), PostController.fetchPostStatistics);

//get real or fake posts
route.get("/fetchUserPosts", checkPermission(MODULES.SOCIAL_MEDIA_POSTS), checkAccessWithSecretKey(), PostController.fetchUserPosts);

//get user's posts
route.get("/listUserPosts", checkPermission(MODULES.SOCIAL_MEDIA_POSTS), checkAccessWithSecretKey(), PostController.listUserPosts);

//delete post of user
route.delete("/discardPost", checkPermission(MODULES.SOCIAL_MEDIA_POSTS), checkAccessWithSecretKey(), PostController.discardPost);

module.exports = route;
