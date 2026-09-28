//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const ReactionController = require("../../controllers/admin/reaction.controller");

//multer
const multer = require("multer");
const storage = require("../../util/multer");
const upload = multer({ storage });

const { checkPermission, MODULES } = require("../../middleware/checkPermission.middleware");

//create reaction
route.post("/addReaction", checkPermission(MODULES.REACTION), checkAccessWithSecretKey(), upload.single("image"), ReactionController.addReaction);

//update reaction
route.patch("/updateReaction", checkPermission(MODULES.REACTION), checkAccessWithSecretKey(), upload.single("image"), ReactionController.updateReaction);

//get all reactions
route.get("/getAllReactions", checkPermission(MODULES.REACTION), checkAccessWithSecretKey(), ReactionController.getAllReactions);

//delete reaction
route.delete("/deleteReaction", checkPermission(MODULES.REACTION), checkAccessWithSecretKey(), ReactionController.deleteReaction);

module.exports = route;
