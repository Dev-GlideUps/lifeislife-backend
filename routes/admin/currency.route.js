const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const currencyController = require("../../controllers/admin/currency.controller");

//create currency
route.post("/addCurrency", checkAccessWithSecretKey(), currencyController.addCurrency);

//update currency
route.patch("/modifyCurrency", checkAccessWithSecretKey(), currencyController.modifyCurrency);

//get currencies
route.get("/retrieveCurrencyInfo", checkAccessWithSecretKey(), currencyController.retrieveCurrencyInfo);

//delete currency
route.delete("/deactivateCurrency", checkAccessWithSecretKey(), currencyController.deactivateCurrency);

//set default currency
route.patch("/updateDefaultCurrency", checkAccessWithSecretKey(), currencyController.updateDefaultCurrency);

//get default currency
route.get("/retrieveDefaultCurrency", checkAccessWithSecretKey(), currencyController.retrieveDefaultCurrency);

module.exports = route;
