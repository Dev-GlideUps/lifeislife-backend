//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const GiftCategoryController = require("../../controllers/admin/giftCategory.controller");

//create giftCategory
route.post("/addGiftCategory", checkAccessWithSecretKey(), GiftCategoryController.addGiftCategory);

//update giftCategory
route.patch("/modifyGiftCategory", checkAccessWithSecretKey(), GiftCategoryController.modifyGiftCategory);

//retrieve all giftCategories
route.get("/fetchGiftCategories", checkAccessWithSecretKey(), GiftCategoryController.fetchGiftCategories);

//delete giftCategory
route.delete("/removeGiftCategory", checkAccessWithSecretKey(), GiftCategoryController.removeGiftCategory);

module.exports = route;
