//express
const express = require("express");
const route = express.Router();

//multer
const multer = require("multer");
const storage = require("../../util/multer");
const upload = multer({ storage });

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//validateFirebaseToken
const validateAuthToken = require("../../middleware/verifyAuthToken.middleware");

//validate user's access token
const validateUserToken = require("../../middleware/validateUserToken.middleware");

//controller
const UserController = require("../../controllers/client/user.controller");

//check the user is exists or not
route.post("/validateUserPresence", checkAccessWithSecretKey(), UserController.validateUserPresence);

//check the user is exists or not for forget password
route.post("/userExistsForReset", checkAccessWithSecretKey(), UserController.userExistsForReset);

//check if mobile or email exists or not
route.post("/checkMobileOrEmailExists", checkAccessWithSecretKey(), UserController.checkMobileOrEmailExists);

//get firebase UID using device UUID
route.get("/fetchFirebaseUidByDeviceId", checkAccessWithSecretKey(), UserController.fetchFirebaseUidByDeviceId);

//get all accounts by device ID
route.get("/deviceAccounts", checkAccessWithSecretKey(), UserController.getDeviceAccounts);

//switch account - get custom token for target user
route.post("/switchAccount", checkAccessWithSecretKey(), UserController.switchAccount);

//create firebase custom token using firebase UID
route.get("/createFirebaseCustomToken", checkAccessWithSecretKey(), UserController.createFirebaseCustomToken);

//user login or sign up
route.post("/loginOrRegisterUser", validateAuthToken, checkAccessWithSecretKey(), UserController.loginOrRegisterUser);

//update profile of the user
route.patch("/updateUserProfile", validateUserToken, checkAccessWithSecretKey(), upload.single("image"), UserController.updateUserProfile);

//update cover image of the user
route.patch("/updateCoverImage", validateUserToken, checkAccessWithSecretKey(), upload.single("coverImage"), UserController.updateCoverImage);

//delete cover image of the user
route.delete("/deleteCoverImage", validateUserToken, checkAccessWithSecretKey(), UserController.deleteCoverImage);

//verify username ( always be unique )
route.get("/checkUserNameAvailability", validateUserToken, checkAccessWithSecretKey(), UserController.checkUserNameAvailability);

//get user profile
route.get("/fetchUserProfile", validateUserToken, checkAccessWithSecretKey(), UserController.fetchUserProfile);

//get user profile (main)
route.get("/getUserInfo", validateUserToken, checkAccessWithSecretKey(), UserController.getUserInfo);

//search users (chat)
route.get("/filterUsersBySearch", validateUserToken, checkAccessWithSecretKey(), UserController.filterUsersBySearch);

//get toUser profile
route.get("/getTargetUserInfo", validateUserToken, checkAccessWithSecretKey(), UserController.getTargetUserInfo);

//update audio/video call permission status
route.patch("/updateCallPermission", validateUserToken, checkAccessWithSecretKey(), UserController.updateCallPermission);

//toggling the user's notification permission status
route.patch("/toggleNotificationPermission", checkAccessWithSecretKey(), UserController.toggleNotificationPermission);

//get user's coin
route.get("/fetchUserCoinBalance", checkAccessWithSecretKey(), UserController.fetchUserCoinBalance);

//convert silver to gold
route.post("/convertSilverToGold", validateUserToken, checkAccessWithSecretKey(), UserController.convertSilverToGold);

//search users (socialList/profileVisitor)
route.get("/searchUsersByType", validateUserToken, checkAccessWithSecretKey(), UserController.searchUsersByType);

//fetch users based on search input ( drop - down )
route.get("/getFilteredUserList", validateUserToken, checkAccessWithSecretKey(), UserController.getFilteredUserList);

//delete user account
route.delete("/deactivateMyAccount", checkAccessWithSecretKey(), UserController.deactivateMyAccount);

//fetch Searched Data by Type (For You, Accounts, Videos, Posts, Songs, Hashtags)
route.get("/retrieveSearchedContent", validateUserToken, checkAccessWithSecretKey(), UserController.retrieveSearchedContent);

module.exports = route;
