//express
const express = require("express");
const route = express.Router();

//checkAccessWithSecretKey
const checkAccessWithSecretKey = require("../../checkAccess");

//controller
const CoinPlanController = require("../../controllers/client/coinPlan.controller");

//get coinplan
route.get("/listCoinPackages", checkAccessWithSecretKey(), CoinPlanController.listCoinPackages);

//purchase coinPlan ( coinPlan history )
//route.post("/recordCoinPlanTransaction", checkAccessWithSecretKey(), CoinPlanController.recordCoinPlanTransaction);

//purchase coinPlan ( stripe )
route.post("/initializeStiprCustomer", checkAccessWithSecretKey(), CoinPlanController.initializeStiprCustomer);

//purchase coinPlan ( stripe )
route.post("/handlePaymentWithStripe", checkAccessWithSecretKey(), CoinPlanController.handlePaymentWithStripe);

//purchase coinPlan ( stripe web — userId in query )
route.post("/initializeStripeCustomerWeb", checkAccessWithSecretKey(), CoinPlanController.initializeStripeCustomerWeb);

//purchase coinPlan ( stripe web — userId from query )
route.post("/handlePaymentWithStripeWeb", checkAccessWithSecretKey(), CoinPlanController.handlePaymentWithStripeWeb);

//purchase coinPlan ( google play )
route.post("/validateGooglePlayPurchase", checkAccessWithSecretKey(), CoinPlanController.validateGooglePlayPurchase);

//purchase coinPlan ( Apple - Legacy )
route.post("/verifyApplePurchase", checkAccessWithSecretKey(), CoinPlanController.verifyApplePurchase);

//purchase coinPlan ( Apple - StoreKit 2 with JWS verification ) - NEW
route.post("/validateApplePurchase", checkAccessWithSecretKey(), CoinPlanController.validateApplePurchase);

//generate razorpay order ( Razorpay )
route.post("/createRazorpayOrder", checkAccessWithSecretKey(), CoinPlanController.createRazorpayOrder);

//verify payment signature (after payment success) ( Razorpay )
route.post("/verifyRazorpaySignature", checkAccessWithSecretKey(), CoinPlanController.verifyRazorpaySignature);

//purchase coinPlan ( Flutterwave )
route.post("/verifyFlutterwavePayment", checkAccessWithSecretKey(), CoinPlanController.verifyFlutterwavePayment);

//purchase coinPlan ( Paystack )
route.post("/validatePaystackPayment", checkAccessWithSecretKey(), CoinPlanController.validatePaystackPayment);

//create order ( PayPal )
route.post("/initiatePayPalOrder", checkAccessWithSecretKey(), CoinPlanController.initiatePayPalOrder);

//purchase coinPlan ( PayPal )
route.post("/validatePaypalPayment", checkAccessWithSecretKey(), CoinPlanController.validatePaypalPayment);

//purchase coinPlan ( Cashfree )
route.post("/validateCashfreePayment", checkAccessWithSecretKey(), CoinPlanController.validateCashfreePayment);

module.exports = route;
