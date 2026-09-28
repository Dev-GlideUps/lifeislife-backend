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
const UserController = require("../../controllers/admin/user.controller");

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

//user dashboard statistics
route.get("/fetchUserDashboardStats", checkPermission(MODULES.USER), checkAccessWithSecretKey(), UserController.fetchUserDashboardStats);

//get users
route.get("/retrieveUsers", checkPermission(MODULES.USER), checkAccessWithSecretKey(), UserController.retrieveUsers);

//update user
route.patch("/modifyUserProfile", checkPermission(MODULES.USER), checkAccessWithSecretKey(), upload.single("image"), UserController.modifyUserProfile);

//toggle user's block status
route.patch("/toggleUserBlockStatus", checkPermission(MODULES.USER), checkAccessWithSecretKey(), UserController.toggleUserBlockStatus);

//instant block user by admin (emits userBlockedByAdmin to user's socket)
route.patch("/instantBlockUser", checkPermission(MODULES.USER), checkAccessWithSecretKey(), UserController.instantBlockUser);

//ban or unban a device ID — blocks login/signup for any account using that device
route.patch("/instantBanDevice", checkPermission(MODULES.USER), checkAccessWithSecretKey(), UserController.instantBanDevice);

//create user
route.post("/registerFakeUser", checkPermission(MODULES.USER), checkAccessWithSecretKey(), upload.single("image"), UserController.registerFakeUser);

//get user's profile
route.get("/retrieveUserProfile", checkAccessWithSecretKey(), UserController.retrieveUserProfile);

//delete user
route.delete("/deleteUser", checkPermission(MODULES.USER), checkAccessWithSecretKey(), UserController.deleteUser);

//get fake/real users ( drop - down )
route.get("/fetchUserList", checkAccessWithSecretKey(), UserController.fetchUserList);

//admin can add or deduct coins from a user's wallet
route.patch("/adminAdjustUserCoin", checkPermission(MODULES.USER), checkAccessWithSecretKey(), UserController.adminAdjustUserCoin);

module.exports = route;
