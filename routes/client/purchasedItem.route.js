//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const PurchasedItemController = require("../../controllers/client/purchasedItem.controller");

//fetching Avatar Frames, Themes, and Rides
route.get("/listStoreItems", checkAccessWithSecretKey(), PurchasedItemController.listStoreItems);

//purchasing a Theme, Avatar Frame, or Ride
route.post("/executePurchaseItem", checkAccessWithSecretKey(), PurchasedItemController.executePurchaseItem);

//wear or take off item
route.patch("/wearOrTakeOffItem", checkAccessWithSecretKey(), PurchasedItemController.wearOrTakeOffItem);

//get purchased Avatar Frames, Themes, and Rides
route.get("/listUserPurchasedItems", checkAccessWithSecretKey(), PurchasedItemController.listUserPurchasedItems);

//get purchased Themes
route.get("/getUserPurchasedThemes", checkAccessWithSecretKey(), PurchasedItemController.getUserPurchasedThemes);

//get recommended items and top 3 most purchased avatarFrames
route.get("/getRecommendations", checkAccessWithSecretKey(), PurchasedItemController.getRecommendations);

module.exports = route;
