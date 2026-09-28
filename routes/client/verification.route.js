//express
const express = require("express");
const route = express.Router();

//multer
const multer = require("multer");
const storage = require("../../util/multer");
const upload = multer({ storage });

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//validate user's access token
const validateUserToken = require("../../middleware/validateUserToken.middleware");

//controller
const VerificationController = require("../../controllers/client/verification.controller");

//Submit user verification
route.post(
  "/submitUserVerificationRequest",
  validateUserToken,
  checkAccessWithSecretKey(),
  upload.fields([
    { name: "idProofUrl", maxCount: 1 },
    { name: "selfieUrl", maxCount: 1 },
  ]),
  VerificationController.submitUserVerificationRequest
);

module.exports = route;
