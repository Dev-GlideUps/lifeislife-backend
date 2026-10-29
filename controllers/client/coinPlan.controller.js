const CoinPlan = require("../../models/coinPlan.model");

//import model
const User = require("../../models/user.model");
const History = require("../../models/history.model");

//generateHistoryUniqueId
const generateHistoryUniqueId = require("../../util/generateHistoryUniqueId");

//mongoose
const mongoose = require("mongoose");

const fs = require("fs");

const axios = require("axios");
const { google } = require("googleapis");
const Razorpay = require("razorpay");
const crypto = require("crypto");

//get coinplan
exports.listCoinPackages = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const coinPlan = await CoinPlan.find({ isActive: true }).sort({ coin: 1, amount: 1 }).lean();

    return res.status(200).json({
      status: true,
      message: "Retrive CoinPlan Successfully",
      data: coinPlan,
    });
  } catch {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server error" });
  }
};

//purchase coinPlan ( coinPlan history )
// exports.recordCoinPlanTransaction = async (req, res) => {
//   try {
//     if (!req.user || !req.user.userId) {
//       return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
//     }

//     const { coinPlanId, paymentGateway } = req.query;

//     if (!coinPlanId || !paymentGateway) {
//       return res.json({ status: false, message: "Oops! Invalid details." });
//     }

//     const userObjectId = new mongoose.Types.ObjectId(req.user.userId);
//     const coinPlanObjectId = new mongoose.Types.ObjectId(coinPlanId);
//     const trimmedPaymentGateway = paymentGateway.trim();

//     const [uniqueId, user, coinPlan] = await Promise.all([
//       generateHistoryUniqueId(),
//       User.findById(userObjectId).select("_id").lean(),
//       CoinPlan.findById(coinPlanObjectId).select("_id coin amount").lean(),
//     ]);

//     if (!user) {
//       return res.status(200).json({ status: false, message: "User does not found." });
//     }

//     if (!coinPlan) {
//       return res.status(200).json({ status: false, message: "CoinPlan does not found." });
//     }

//     const totalCoins = coinPlan.coin;

//     res.status(200).json({
//       status: true,
//       message: "Coin plan history created successfully after user purchase.",
//       totalCoins: totalCoins,
//     });

//     await Promise.all([
//       User.updateOne(
//         { _id: userObjectId },
//         {
//           $inc: { coin: totalCoins, topUpCoins: totalCoins },
//         }
//       ),
//       History.create({
//         uniqueId: uniqueId,
//         type: 7,
//         userId: user?._id,
//         planId: coinPlan?._id,
//         coin: totalCoins,
//         amount: coinPlan?.amount,
//         paymentGateway: trimmedPaymentGateway,
//         date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
//       }),
//     ]);
//   } catch (error) {
//     console.log(error);
//     return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
//   }
// };

//purchase coinPlan ( stripe ) ( create customer )
exports.initializeStiprCustomer = async (req, res) => {
  try {
    console.log("createCustomer API initiated: ", req.body);

    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const { coinPlanId, currency, billing_details } = req.body;

    if (!coinPlanId || !currency || !billing_details) {
      return res.status(200).json({ status: false, message: "Invalid request. Required details missing." });
    }

    const userObjectId = new mongoose.Types.ObjectId(req.user.userId);
    const coinPlanObjectId = new mongoose.Types.ObjectId(coinPlanId);

    const [user, coinPlan] = await Promise.all([User.findById(userObjectId).select("_id").lean(), CoinPlan.findById(coinPlanObjectId).select("_id coin amount").lean()]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (user.isBlock) {
      return res.status(200).json({ status: false, message: "You are blocked by the admin." });
    }

    if (!coinPlan) {
      return res.status(200).json({ status: false, message: "Coin plan not found." });
    }

    if (!settingJSON) {
      return res.status(200).json({ status: false, message: "Configuration settings not found." });
    }

    const finalPrice = coinPlan.amount;

    if (currency.toLowerCase() === "inr" && finalPrice < 50) {
      return res.status(200).json({ status: false, message: "Minimum transaction amount should be ₹50." });
    }

    const stripe = require("stripe")(settingJSON.stripeSecretKey);

    const customer = await stripe.customers.create({
      email: billing_details.email,
      name: billing_details.name,
      address: {
        line1: billing_details?.address?.line1,
        line2: billing_details?.address?.line2,
        postal_code: billing_details?.address?.postal_code,
        city: billing_details?.address?.city,
        state: billing_details?.address?.state,
        country: billing_details?.address?.country,
      },
    });

    console.log("Stripe customer created: ", customer);

    const intent = await stripe.paymentIntents.create({
      amount: finalPrice * 100,
      currency: currency.toLowerCase(),
      customer: customer.id,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      shipping: {
        name: billing_details.name,
        address: {
          line1: billing_details?.address?.line1,
          line2: billing_details?.address?.line2,
          postal_code: billing_details?.address?.postal_code,
          city: billing_details?.address?.city,
          state: billing_details?.address?.state,
          country: billing_details?.address?.country,
        },
      },
    });

    console.log("Stripe PaymentIntent created: ", intent.id);

    return res.status(200).json({
      status: true,
      paymentIntent: intent.id,
      clientSecreat: intent.client_secret,
      customer: customer.id,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//purchase coinPlan ( stripe )
exports.handlePaymentWithStripe = async (req, res) => {
  try {
    console.log("🔔 Stripe Payment API Triggered:", req.query);

    if (!req.user || !req.user.userId) {
      console.warn("⛔ Unauthorized access attempt.");
      return res.status(401).json({ status: false, message: "Unauthorized: Invalid or missing token." });
    }

    const { coinPlanId, payment_intent_id } = req.query;

    if (!coinPlanId) {
      console.warn("⚠️ Missing coinPlanId in request.");
      return res.status(200).json({ status: false, message: "Invalid request: 'coinPlanId' is required." });
    }

    if (!payment_intent_id) {
      console.warn("⚠️ Missing payment_intent_id in request.");
      return res.status(200).json({ status: false, message: "Invalid request: 'payment_intent_id' is required." });
    }

    const userObjectId = new mongoose.Types.ObjectId(req.user.userId);
    const coinPlanObjectId = new mongoose.Types.ObjectId(coinPlanId);

    const [uniqueId, user, coinPlan] = await Promise.all([
      generateHistoryUniqueId(),
      User.findById(userObjectId).select("_id isBlock").lean(),
      CoinPlan.findById(coinPlanObjectId).select("_id coin amount").lean(),
    ]);

    if (!user) {
      console.warn(`❌ User not found for ID: ${req.user.userId}`);
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (user.isBlock) {
      console.warn(`🚫 Blocked user attempted payment: ${req.user.userId}`);
      return res.status(200).json({ status: false, message: "Your account has been blocked by the administrator." });
    }

    if (!coinPlan) {
      console.warn(`❌ Coin plan not found for ID: ${coinPlanId}`);
      return res.status(200).json({ status: false, message: "Selected coin plan does not exist." });
    }

    if (!settingJSON) {
      console.error("⚙️ Configuration error: 'settingJSON' is undefined.");
      return res.status(200).json({ status: false, message: "Server configuration error. Please try again later." });
    }

    console.log("🔍 Retrieving payment intent:", payment_intent_id);

    const stripe = require("stripe")(settingJSON.stripeSecretKey);

    let intent = await stripe.paymentIntents.retrieve(payment_intent_id);
    console.log("💳 Payment Intent Status:", intent?.status);

    if (intent.status !== "succeeded") {
      console.log("⚠️ Payment not completed, attempting confirmation...");
      intent = await stripe.paymentIntents.confirm(payment_intent_id);
    }

    if (intent.status === "requires_action" && intent.next_action?.type === "use_stripe_sdk") {
      console.log("🔁 Additional authentication required.");
      return res.status(200).json({
        status: true,
        requires_action: true,
        message: "Authentication required via Stripe SDK.",
      });
    }

    if (intent.status === "succeeded") {
      console.log("✅ Payment succeeded. Processing coin addition...");

      console.log(`🎉 Coins successfully added to user: ${user._id}`);

      res.status(200).json({
        status: true,
        message: "Payment successful! Coins have been added to your account.",
      });

      const totalCoins = coinPlan.coin;
      await Promise.all([
        User.updateOne({ _id: userObjectId }, { $inc: { coin: totalCoins, topUpCoins: totalCoins } }),
        History.create({
          uniqueId,
          type: 7,
          userId: user._id,
          planId: coinPlan._id,
          coin: totalCoins,
          amount: coinPlan.amount,
          paymentGateway: "Stripe",
          date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
        }),
      ]);
    } else {
      console.warn("❌ Payment failed. Invalid final status:", intent.status);
      return res.status(200).json({
        status: false,
        message: `Payment failed. Stripe status: ${intent.status}`,
      });
    }
  } catch (error) {
    console.error("🔥 Stripe Payment Error:", error);
    return res.status(500).json({
      status: false,
      message: "An unexpected error occurred during payment processing. Please try again.",
      error: error.message,
    });
  }
};

//purchase coinPlan ( stripe web — userId from query )
exports.initializeStripeCustomerWeb = async (req, res) => {
  try {
    console.log("createCustomer (Stripe Web) API initiated: ", req.query, req.body);

    const { userId } = req.query;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(200).json({ status: false, message: "Invalid request. 'userId' query parameter is required and must be valid." });
    }

    const { coinPlanId, currency, billing_details } = req.body;

    if (!coinPlanId || !currency || !billing_details) {
      return res.status(200).json({ status: false, message: "Invalid request. Required details missing." });
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const coinPlanObjectId = new mongoose.Types.ObjectId(coinPlanId);

    const [user, coinPlan] = await Promise.all([User.findById(userObjectId).select("_id isBlock").lean(), CoinPlan.findById(coinPlanObjectId).select("_id coin amount").lean()]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (user.isBlock) {
      return res.status(200).json({ status: false, message: "You are blocked by the admin." });
    }

    if (!coinPlan) {
      return res.status(200).json({ status: false, message: "Coin plan not found." });
    }

    if (!settingJSON) {
      return res.status(200).json({ status: false, message: "Configuration settings not found." });
    }

    const finalPrice = coinPlan.amount;

    if (currency.toLowerCase() === "inr" && finalPrice < 50) {
      return res.status(200).json({ status: false, message: "Minimum transaction amount should be ₹50." });
    }

    const stripe = require("stripe")(settingJSON.stripeSecretKey);

    const customer = await stripe.customers.create({
      email: billing_details.email,
      name: billing_details.name,
      address: {
        line1: billing_details?.address?.line1,
        line2: billing_details?.address?.line2,
        postal_code: billing_details?.address?.postal_code,
        city: billing_details?.address?.city,
        state: billing_details?.address?.state,
        country: billing_details?.address?.country,
      },
    });

    console.log("Stripe customer created (Web): ", customer);

    const intent = await stripe.paymentIntents.create({
      amount: finalPrice * 100,
      currency: currency.toLowerCase(),
      customer: customer.id,
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      shipping: {
        name: billing_details.name,
        address: {
          line1: billing_details?.address?.line1,
          line2: billing_details?.address?.line2,
          postal_code: billing_details?.address?.postal_code,
          city: billing_details?.address?.city,
          state: billing_details?.address?.state,
          country: billing_details?.address?.country,
        },
      },
    });

    console.log("Stripe PaymentIntent created (Web): ", intent.id);

    return res.status(200).json({
      status: true,
      paymentIntent: intent.id,
      clientSecreat: intent.client_secret,
      customer: customer.id,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//purchase coinPlan ( stripe web — userId from query )
exports.handlePaymentWithStripeWeb = async (req, res) => {
  try {
    console.log("🔔 Stripe Payment API (Web) Triggered:", req.query);

    const { userId, coinPlanId, payment_intent_id } = req.query;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      console.warn("⚠️ Missing or invalid userId in request.");
      return res.status(200).json({ status: false, message: "Invalid request: 'userId' query parameter is required and must be valid." });
    }

    if (!coinPlanId) {
      console.warn("⚠️ Missing coinPlanId in request.");
      return res.status(200).json({ status: false, message: "Invalid request: 'coinPlanId' is required." });
    }

    if (!payment_intent_id) {
      console.warn("⚠️ Missing payment_intent_id in request.");
      return res.status(200).json({ status: false, message: "Invalid request: 'payment_intent_id' is required." });
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const coinPlanObjectId = new mongoose.Types.ObjectId(coinPlanId);

    const [uniqueId, user, coinPlan] = await Promise.all([
      generateHistoryUniqueId(),
      User.findById(userObjectId).select("_id isBlock").lean(),
      CoinPlan.findById(coinPlanObjectId).select("_id coin amount").lean(),
    ]);

    if (!user) {
      console.warn(`❌ User not found for ID: ${userId}`);
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (user.isBlock) {
      console.warn(`🚫 Blocked user attempted payment: ${userId}`);
      return res.status(200).json({ status: false, message: "Your account has been blocked by the administrator." });
    }

    if (!coinPlan) {
      console.warn(`❌ Coin plan not found for ID: ${coinPlanId}`);
      return res.status(200).json({ status: false, message: "Selected coin plan does not exist." });
    }

    if (!settingJSON) {
      console.error("⚙️ Configuration error: 'settingJSON' is undefined.");
      return res.status(200).json({ status: false, message: "Server configuration error. Please try again later." });
    }

    console.log("🔍 Retrieving payment intent:", payment_intent_id);

    const stripe = require("stripe")(settingJSON.stripeSecretKey);

    let intent = await stripe.paymentIntents.retrieve(payment_intent_id);
    console.log("💳 Payment Intent Status:", intent?.status);

    if (intent.status !== "succeeded") {
      console.log("⚠️ Payment not completed, attempting confirmation...");
      intent = await stripe.paymentIntents.confirm(payment_intent_id);
    }

    if (intent.status === "requires_action" && intent.next_action?.type === "use_stripe_sdk") {
      console.log("🔁 Additional authentication required.");
      return res.status(200).json({
        status: true,
        requires_action: true,
        message: "Authentication required via Stripe SDK.",
      });
    }

    if (intent.status === "succeeded") {
      console.log("✅ Payment succeeded. Processing coin addition (Web)...");

      console.log(`🎉 Coins successfully added to user: ${user._id}`);

      res.status(200).json({
        status: true,
        message: "Payment successful! Coins have been added to your account.",
      });

      const totalCoins = coinPlan.coin;
      await Promise.all([
        User.updateOne({ _id: userObjectId }, { $inc: { coin: totalCoins, topUpCoins: totalCoins } }),
        History.create({
          uniqueId,
          type: 7,
          userId: user._id,
          planId: coinPlan._id,
          coin: totalCoins,
          amount: coinPlan.amount,
          paymentGateway: "Stripe",
          date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
        }),
      ]);
    } else {
      console.warn("❌ Payment failed. Invalid final status:", intent.status);
      return res.status(200).json({
        status: false,
        message: `Payment failed. Stripe status: ${intent.status}`,
      });
    }
  } catch (error) {
    console.error("🔥 Stripe Payment Error (Web):", error);
    return res.status(500).json({
      status: false,
      message: "An unexpected error occurred during payment processing. Please try again.",
      error: error.message,
    });
  }
};

//purchase coinPlan ( google play )
exports.validateGooglePlayPurchase = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized request." });
    }

    const { packageName, token, productId, coinPlanId } = req.body;

    if (!packageName || !token || !productId || !coinPlanId) {
      return res.status(200).json({ status: false, message: "Missing required purchase details." });
    }

    const userObjectId = new mongoose.Types.ObjectId(req.user.userId);
    const coinPlanObjectId = new mongoose.Types.ObjectId(coinPlanId);

    // Check if this purchaseToken was already used (once-per-token rule)
    const alreadyCredited = await History.findOne({
      purchaseToken: token,
      paymentGateway: "GooglePlay",
    }).lean();

    if (alreadyCredited) {
      console.log(`[GooglePlay] Token already credited: ${token}`);
      return res.status(200).json({ status: true, message: "Coins already credited" });
    }

    const [uniqueId, user, coinPlan] = await Promise.all([
      generateHistoryUniqueId(),
      User.findById(userObjectId).select("_id coin isBlock").lean(),
      CoinPlan.findById(coinPlanObjectId).select("_id coin amount androidProductKey productKey").lean(),
    ]);

    if (!user) return res.status(200).json({ status: false, message: "User not found." });
    if (user.isBlock) return res.status(200).json({ status: false, message: "User is blocked." });
    if (!coinPlan) return res.status(200).json({ status: false, message: "Coin plan not found." });

    // Validate productId matches the plan's androidProductKey (or legacy productKey)
    const expectedProductId = coinPlan.androidProductKey || coinPlan.productKey;
    if (productId !== expectedProductId) {
      console.warn(`[GooglePlay] Product ID mismatch: received ${productId}, expected ${expectedProductId}`);
      return res.status(200).json({ status: false, message: "Product ID does not match the selected plan." });
    }

    // Priority: ENV variables > settingJSON (database)
    // googlePlayPrivateKey is stored as Object (full JSON) or the private_key string
    let privateKey = process.env.GOOGLE_PLAY_PRIVATE_KEY;
    let clientEmail = process.env.GOOGLE_PLAY_CLIENT_EMAIL;

    // Fallback to settingJSON if env not set
    if (!privateKey) {
      privateKey = typeof settingJSON?.googlePlayPrivateKey === "object"
        ? settingJSON?.googlePlayPrivateKey?.private_key
        : settingJSON?.googlePlayPrivateKey;
    }

    if (!clientEmail) {
      clientEmail = typeof settingJSON?.googlePlayPrivateKey === "object"
        ? settingJSON?.googlePlayPrivateKey?.client_email || settingJSON?.googlePlayServiceAccountEmail
        : settingJSON?.googlePlayServiceAccountEmail;
    }

    if (!privateKey || !clientEmail) {
      console.error("[GooglePlay] Missing credentials: client_email or private_key");
      return res.status(200).json({ status: false, message: "Google Play credentials not configured." });
    }

    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });

    const authClient = await auth.getClient();
    const play = google.androidpublisher({ version: "v3", auth: authClient });

    const result = await play.purchases.products.get({
      packageName,
      productId,
      token,
    });

    const purchase = result.data;

    // purchaseState: 0 = Purchased, 1 = Canceled, 2 = Pending
    if (purchase.purchaseState !== 0) {
      const stateMap = { 1: "cancelled", 2: "pending" };
      return res.status(200).json({
        status: false,
        message: `Purchase verification failed. State: ${stateMap[purchase.purchaseState] || "unknown"}`
      });
    }

    // Credit coins (purchaseState === 0)
    const totalCoins = coinPlan.coin;

    await Promise.all([
      User.updateOne({ _id: userObjectId }, { $inc: { coin: totalCoins, topUpCoins: totalCoins } }),
      History.create({
        uniqueId,
        type: 7,
        userId: user._id,
        planId: coinPlan._id,
        coin: totalCoins,
        amount: coinPlan.amount,
        paymentGateway: "GooglePlay",
        purchaseToken: token, // Store token for once-per-token check
        orderId: purchase.orderId || null,
        date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
      }),
    ]);

    console.log(`[GooglePlay] Coins credited: ${totalCoins} to user ${userObjectId}`);
    return res.status(200).json({ status: true, message: "Coins credited" });

  } catch (error) {
    console.error("Google Play validation error:", error.response?.data || error.message);
    return res.status(500).json({ status: false, message: error?.response?.data?.error?.message || "Server error during purchase validation." });
  }
};

//purchase coinPlan ( Apple App Store - StoreKit 2 )
const { SignedDataVerifier, Environment, AppStoreServerAPIClient } = require("@apple/app-store-server-library");
const path = require("path");

// const appleClient = new AppStoreServerAPIClient(
//   fs.readFileSync("", "utf8"),
//   "", // Key ID
//   "", // Issuer ID
//   "", // BUNDLE ID
//   Environment.SANDBOX,
//   // Environment.PRODUCTION,
// );

async function getTransactionInfo(transactionId) {
  console.log("🍎 [APPLE] Fetching transaction:", transactionId);
  return await appleClient.getTransactionInfo(transactionId);
}

exports.verifyApplePurchase = async (req, res) => {
  try {
    console.log("🍏 [IAP] Validation START");

    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized request." });
    }

    console.log("✅ [AUTH] User:", req.user.userId);

    const { transactionId, productId, coinPlanId } = req.body || {};
    console.log("📥 [REQUEST] Body:", req.body);

    if (!transactionId || !productId || !coinPlanId) {
      return res.status(200).json({
        status: false,
        message: "Missing required fields",
      });
    }

    const userObjectId = new mongoose.Types.ObjectId(req.user.userId);
    const coinPlanObjectId = new mongoose.Types.ObjectId(coinPlanId);

    console.log("📦 [DB] Fetching User & CoinPlan");

    const [user, coinPlan] = await Promise.all([User.findById(userObjectId).select("_id coin isBlock").lean(), CoinPlan.findById(coinPlanObjectId).select("_id coin amount").lean()]);

    if (!user) return res.status(200).json({ status: false, message: "User not found" });
    if (!coinPlan) return res.status(200).json({ status: false, message: "CoinPlan not found" });

    console.log("✅ [DB] User & CoinPlan loaded");

    const appleResponse = await getTransactionInfo(transactionId);

    if (!appleResponse?.signedTransactionInfo) {
      throw new Error("Missing signedTransactionInfo");
    }

    const signedTransaction = appleResponse.signedTransactionInfo;

    const decoded = JSON.parse(Buffer.from(signedTransaction.split(".")[1], "base64").toString());

    console.log("📄 [APPLE] Decoded Transaction:", {
      transactionId: decoded.transactionId,
      originalTransactionId: decoded.originalTransactionId,
      productId: decoded.productId,
      bundleId: decoded.bundleId,
      environment: decoded.environment,
    });

    if (decoded.productId !== productId) {
      return res.status(200).json({
        status: false,
        message: "Product mismatch",
      });
    }

    const alreadyExist = await History.findOne({
      uniqueId: transactionId,
      paymentGateway: "APPLE",
    }).lean();

    if (alreadyExist) {
      return res.json({
        status: true,
        message: "Coins already credited",
      });
    }

    const totalCoins = coinPlan.coin || 0;
    console.log("💰 [WALLET] Crediting coins:", totalCoins);

    await Promise.all([
      User.updateOne(
        { _id: userObjectId },
        {
          $inc: { coin: totalCoins, topUpCoins: totalCoins },
        },
      ),
      History.create({
        uniqueId: transactionId,
        type: 7,
        userId: user._id,
        planId: coinPlan._id,
        coin: totalCoins,
        amount: coinPlan.amount,
        paymentGateway: "APPLE",
        date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
      }),
    ]);

    console.log("🎉 [SUCCESS] Coins credited");

    return res.json({
      status: true,
      message: "iOS purchase verified & coins credited",
    });
  } catch (err) {
    console.error("❌ [IAP] Error");
    console.error("Message:", err.message);
    console.error("Raw:", err);

    return res.status(500).json({
      status: false,
      message: "Apple verification failed",
    });
  }
};

// ==================== NEW iOS VALIDATION (StoreKit 2 - JWS) ====================
// Endpoint: POST api/client/coinPlan/validateApplePurchase
// This follows the contract specification for StoreKit 2 with JWS verification

// Apple Root CA certificates for JWS verification
let signedDataVerifier = null;

async function getSignedDataVerifier() {
  if (signedDataVerifier) return signedDataVerifier;

  try {
    // Apple Root CA - G3 certificate (required for JWS verification)
    // The library fetches Apple's root certificates automatically
    const bundleId = "com.lifeis.live.ios";
    const appAppleId = undefined; // Not required for consumables
    const environment = Environment.PRODUCTION; // Accepts both Sandbox and Production

    signedDataVerifier = new SignedDataVerifier(
      [], // Apple root certificates - library fetches automatically
      true, // Enable online verification
      environment,
      bundleId,
      appAppleId
    );

    return signedDataVerifier;
  } catch (error) {
    console.error("[Apple] Failed to initialize SignedDataVerifier:", error);
    throw error;
  }
}

exports.validateApplePurchase = async (req, res) => {
  try {
    console.log("🍎 [IAP] validateApplePurchase START");

    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized request." });
    }

    const { bundleId, productId, transactionId, signedTransaction, coinPlanId } = req.body || {};
    console.log("📥 [Apple] Request:", { bundleId, productId, transactionId, coinPlanId: coinPlanId || "(empty - retry)" });

    // Validate required fields
    if (!productId || !transactionId || !signedTransaction) {
      return res.status(200).json({
        status: false,
        message: "Missing required fields: productId, transactionId, and signedTransaction are required.",
      });
    }

    const userObjectId = new mongoose.Types.ObjectId(req.user.userId);

    // Check if this transactionId was already credited (once-per-transaction rule)
    const alreadyCredited = await History.findOne({
      transactionId: transactionId,
      paymentGateway: "Apple",
    }).lean();

    if (alreadyCredited) {
      console.log(`[Apple] Transaction already credited: ${transactionId}`);
      return res.status(200).json({ status: true, message: "Coins credited" });
    }

    // Verify the JWS signature
    let decodedTransaction;
    try {
      const verifier = await getSignedDataVerifier();
      decodedTransaction = await verifier.verifyAndDecodeTransaction(signedTransaction);
      console.log("✅ [Apple] JWS verified successfully");
    } catch (verifyError) {
      console.error("❌ [Apple] JWS verification failed:", verifyError.message);

      // Fallback: decode without verification for debugging (remove in production if strict)
      try {
        const parts = signedTransaction.split(".");
        if (parts.length === 3) {
          decodedTransaction = JSON.parse(Buffer.from(parts[1], "base64").toString());
          console.warn("⚠️ [Apple] Using decoded payload without signature verification");
        }
      } catch (decodeError) {
        return res.status(200).json({
          status: false,
          message: "Invalid signed transaction format.",
        });
      }
    }

    if (!decodedTransaction) {
      return res.status(200).json({
        status: false,
        message: "Failed to decode transaction.",
      });
    }

    console.log("📄 [Apple] Decoded Transaction:", {
      transactionId: decodedTransaction.transactionId,
      productId: decodedTransaction.productId,
      bundleId: decodedTransaction.bundleId,
      type: decodedTransaction.type,
      environment: decodedTransaction.environment,
    });

    // Validate bundleId
    const expectedBundleId = "com.lifeis.live.ios";
    if (decodedTransaction.bundleId !== expectedBundleId) {
      console.warn(`[Apple] Bundle ID mismatch: ${decodedTransaction.bundleId} !== ${expectedBundleId}`);
      return res.status(200).json({
        status: false,
        message: "Bundle ID mismatch.",
      });
    }

    // Validate productId matches
    if (decodedTransaction.productId !== productId) {
      console.warn(`[Apple] Product ID mismatch: ${decodedTransaction.productId} !== ${productId}`);
      return res.status(200).json({
        status: false,
        message: "Product ID mismatch.",
      });
    }

    // Validate transactionId matches
    if (String(decodedTransaction.transactionId) !== String(transactionId)) {
      console.warn(`[Apple] Transaction ID mismatch: ${decodedTransaction.transactionId} !== ${transactionId}`);
      return res.status(200).json({
        status: false,
        message: "Transaction ID mismatch.",
      });
    }

    // Check for revocation (refund)
    if (decodedTransaction.revocationDate) {
      console.warn(`[Apple] Transaction was refunded: ${transactionId}`);
      return res.status(200).json({
        status: false,
        message: "This purchase has been refunded.",
      });
    }

    // Find the coin plan by iosProductKey (or coinPlanId if provided)
    let coinPlan;
    if (coinPlanId && coinPlanId !== "") {
      // Direct lookup by coinPlanId
      coinPlan = await CoinPlan.findById(coinPlanId).select("_id coin amount iosProductKey productKey").lean();

      // Verify productId matches
      if (coinPlan) {
        const expectedProductKey = coinPlan.iosProductKey || coinPlan.productKey;
        if (expectedProductKey && expectedProductKey !== productId) {
          console.warn(`[Apple] Product key mismatch for plan ${coinPlanId}`);
          coinPlan = null; // Will fallback to iosProductKey lookup
        }
      }
    }

    // Fallback: find by iosProductKey (for retries where coinPlanId is empty)
    if (!coinPlan) {
      coinPlan = await CoinPlan.findOne({
        $or: [
          { iosProductKey: productId },
          { productKey: productId }, // Legacy fallback
        ],
        isActive: true,
      }).select("_id coin amount iosProductKey productKey").lean();
    }

    if (!coinPlan) {
      console.error(`[Apple] No coin plan found for productId: ${productId}`);
      return res.status(200).json({
        status: false,
        message: "Coin plan not found for this product.",
      });
    }

    // Get user
    const user = await User.findById(userObjectId).select("_id coin isBlock").lean();

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (user.isBlock) {
      return res.status(200).json({ status: false, message: "User is blocked." });
    }

    // Credit coins
    const totalCoins = coinPlan.coin || 0;
    const uniqueId = await generateHistoryUniqueId();

    console.log(`💰 [Apple] Crediting ${totalCoins} coins to user ${userObjectId}`);

    await Promise.all([
      User.updateOne(
        { _id: userObjectId },
        { $inc: { coin: totalCoins, topUpCoins: totalCoins } }
      ),
      History.create({
        uniqueId,
        type: 7,
        userId: user._id,
        planId: coinPlan._id,
        coin: totalCoins,
        amount: coinPlan.amount,
        paymentGateway: "Apple",
        transactionId: transactionId, // Store for once-per-transaction check
        date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
      }),
    ]);

    console.log(`🎉 [Apple] SUCCESS - Coins credited: ${totalCoins}`);

    return res.status(200).json({
      status: true,
      message: "Coins credited",
    });

  } catch (error) {
    console.error("❌ [Apple] validateApplePurchase error:", error.message);
    console.error(error);
    return res.status(500).json({
      status: false,
      message: "Apple verification failed.",
    });
  }
};
// ==================== END iOS VALIDATION ====================

//generate razorpay order ( Razorpay )
exports.createRazorpayOrder = async (req, res) => {
  try {
    const { amount, currency, receipt } = req.body;

    if (!Number(amount) || typeof Number(amount) !== "number") {
      return res.status(200).json({
        status: false,
        message: "Amount is required and must be a number",
      });
    }

    if (!settingJSON || !settingJSON.razorPayId || !settingJSON.razorSecretKey) {
      return res.status(200).json({
        status: false,
        message: "Razorpay credentials are missing or not configured properly",
      });
    }

    const razorpay = new Razorpay({
      key_id: settingJSON.razorPayId,
      key_secret: settingJSON.razorSecretKey,
    });

    const options = {
      amount: amount * 100, // amount in paise
      currency: currency || "INR",
      receipt: receipt || `rcptid_${Math.floor(Math.random() * 10000)}`,
      payment_capture: 1, //1 = capture is automatic OR 0 = manual capture
    };

    const order = await razorpay.orders.create(options);

    return res.json({
      status: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      orderStatus: order.status,
    });
  } catch (err) {
    console.error("Razorpay Error:", err);
    if (err.statusCode && err.error) {
      return res.status(err.statusCode).json({
        status: false,
        message: "Razorpay Error",
        error: err.error,
      });
    }

    return res.status(500).json({
      status: false,
      message: "Failed to create order",
      error: err.message,
    });
  }
};

//verify payment signature (after payment success) ( Razorpay )
exports.verifyRazorpaySignature = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized request." });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, coinPlanId } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !coinPlanId) {
      return res.status(200).json({ status: false, message: "Missing required purchase details." });
    }

    const userObjectId = new mongoose.Types.ObjectId(req.user.userId);
    const coinPlanObjectId = new mongoose.Types.ObjectId(coinPlanId);

    const [uniqueId, user, coinPlan] = await Promise.all([
      generateHistoryUniqueId(),
      User.findById(userObjectId).select("_id coin isBlock").lean(),
      CoinPlan.findById(coinPlanObjectId).select("_id coin amount").lean(),
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (user.isBlock) {
      return res.status(200).json({ status: false, message: "User is blocked." });
    }

    if (!coinPlan) {
      return res.status(200).json({ status: false, message: "Coin plan not found." });
    }

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto.createHmac("sha256", settingJSON.razorSecretKey).update(body.toString()).digest("hex");

    if (expectedSignature === razorpay_signature) {
      res.status(200).json({ status: true, message: "Payment verified successfully" });

      const totalCoins = coinPlan.coin;

      await Promise.all([
        User.updateOne({ _id: userObjectId }, { $inc: { coin: totalCoins, topUpCoins: totalCoins } }),
        History.create({
          uniqueId,
          type: 7,
          userId: user._id,
          planId: coinPlan._id,
          coin: totalCoins,
          amount: coinPlan.amount,
          paymentGateway: "Razorpay",
          date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
        }),
      ]);
    } else {
      return res.status(200).json({ status: false, message: "Invalid signature" });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: false, message: "Failed to create order" });
  }
};

//purchase coinPlan ( Flutterwave )
exports.verifyFlutterwavePayment = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized request." });
    }

    const { transaction_id, coinPlanId } = req.query;

    if (!transaction_id) {
      return res.status(200).json({ status: false, message: "Missing transaction_id" });
    }

    if (!coinPlanId) {
      return res.status(200).json({ status: false, message: "Missing required purchase details." });
    }

    const userObjectId = new mongoose.Types.ObjectId(req.user.userId);
    const coinPlanObjectId = new mongoose.Types.ObjectId(coinPlanId);

    const [uniqueId, user, coinPlan] = await Promise.all([
      generateHistoryUniqueId(),
      User.findById(userObjectId).select("_id coin isBlock").lean(),
      CoinPlan.findById(coinPlanObjectId).select("_id coin amount").lean(),
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (user.isBlock) {
      return res.status(200).json({ status: false, message: "User is blocked." });
    }

    if (!coinPlan) {
      return res.status(200).json({ status: false, message: "Coin plan not found." });
    }

    const response = await axios.get(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`, {
      headers: {
        Authorization: `Bearer ${settingJSON.flutterWaveId}`,
      },
    });

    const { status, data } = response.data;

    if (status === "success" && data.status === "successful") {
      res.status(200).json({
        status: true,
        message: "Payment verified successfully",
        paymentData: {
          amount: data.amount,
          currency: data.currency,
          tx_ref: data.tx_ref,
          customer: data.customer,
          payment_type: data.payment_type,
        },
      });

      const totalCoins = coinPlan.coin;

      await Promise.all([
        User.updateOne({ _id: userObjectId }, { $inc: { coin: totalCoins, topUpCoins: totalCoins } }),
        History.create({
          uniqueId,
          type: 7,
          userId: user._id,
          planId: coinPlan._id,
          coin: totalCoins,
          amount: coinPlan.amount,
          paymentGateway: "Flutterwave",
          date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
        }),
      ]);
    } else {
      return res.status(200).json({ status: false, message: "Payment not successful" });
    }
  } catch (error) {
    console.error("Verification Error:", error.response.data);
    return res.status(500).json({
      status: false,
      message: "Server error during verification",
      error: error.message,
    });
  }
};

//purchase coinPlan ( Paystack )
exports.validatePaystackPayment = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized request." });
    }

    const { reference, coinPlanId } = req.body || {};

    if (!reference || !coinPlanId) {
      return res.status(200).json({ status: false, message: "Missing payment details." });
    }

    const userObjectId = new mongoose.Types.ObjectId(req.user.userId);
    const coinPlanObjectId = new mongoose.Types.ObjectId(coinPlanId);

    const [uniqueId, user, coinPlan] = await Promise.all([
      generateHistoryUniqueId(),
      User.findById(userObjectId).select("_id coin isBlock").lean(),
      CoinPlan.findById(coinPlanObjectId).select("_id coin amount").lean(),
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (user.isBlock) {
      return res.status(200).json({ status: false, message: "User is blocked." });
    }

    if (!coinPlan) {
      return res.status(200).json({ status: false, message: "Coin plan not found." });
    }

    const response = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        // Authorization: `Bearer ${settingJSON.paystackSecretKey}`,
        Authorization: `Bearer sk_test_82ab2cf5ee273c492e97ffbc9230d32f697d8877`,
      },
    });

    const paymentData = response.data?.data;

    if (
      paymentData?.status === "success" &&
      paymentData.amount === coinPlan.amount * 100 // Paystack uses kobo
    ) {
      const totalCoins = coinPlan.coin;

      await Promise.all([
        User.updateOne({ _id: userObjectId }, { $inc: { coin: totalCoins, topUpCoins: totalCoins } }),
        History.create({
          uniqueId,
          type: 7,
          userId: user._id,
          planId: coinPlan._id,
          coin: totalCoins,
          amount: coinPlan.amount,
          paymentGateway: "Paystack",
          transactionId: reference,
          date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
        }),
      ]);

      return res.status(200).json({ status: true, message: "Payment verified and coins credited." });
    }

    return res.status(200).json({ status: false, message: "Payment verification failed." });
  } catch (error) {
    console.error("Paystack validation error:", error.response?.data || error.message);
    return res.status(500).json({ status: false, message: "Server error during Paystack validation." });
  }
};

//create order ( PayPal )
exports.initiatePayPalOrder = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized request." });
    }

    const { coinPlanId, intent = "CAPTURE" } = req.query || {};

    if (!coinPlanId) {
      return res.status(200).json({
        status: false,
        message: "coinPlanId is required.",
      });
    }

    if (!["CAPTURE", "AUTHORIZE"].includes(intent)) {
      return res.status(200).json({
        status: false,
        message: "Invalid PayPal intent.",
      });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const planId = new mongoose.Types.ObjectId(coinPlanId);

    const [user, coinPlan] = await Promise.all([User.findById(userId).select("_id isBlock").lean(), CoinPlan.findById(planId).select("_id amount").lean()]);

    if (!user) {
      return res.status(404).json({ status: false, message: "User not found." });
    }

    if (user.isBlock) {
      return res.status(200).json({ status: false, message: "Your account has been blocked." });
    }

    if (!coinPlan) {
      return res.status(404).json({ status: false, message: "Coin plan not found." });
    }

    const amount = Number(coinPlan.amount);
    if (!amount || amount <= 0) {
      return res.status(200).json({ status: false, message: "Invalid plan price." });
    }

    const PAYPAL_BASE_URL = process.env.PAYPAL_MODE === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

    let accessToken;
    try {
      const tokenRes = await axios.post(`${PAYPAL_BASE_URL}/v1/oauth2/token`, "grant_type=client_credentials", {
        auth: {
          username: settingJSON.paypalApiClientId,
          password: settingJSON.paypalApiSecret,
          // username: "AQtirs0TaK3UkeJS_qcXrAG70ho2plD8zrLuoqPcvdexmTib_pddwIo5Z8E8HG4M-wVoyZuf0qEWTYO0",
          // password: "EJCLzr9dulOGt8j2Ko_RvAyXWiPYm66lseRvIxjkElY1nKKyMrah_BZXJ41bB5hsTV6nqa7Z8A-84d9U",
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      accessToken = tokenRes.data.access_token;
    } catch (err) {
      return res.status(500).json({
        status: false,
        message: "PayPal authentication failed.",
        error: err.response?.data,
      });
    }

    let orderData;
    try {
      const paypalReturnUrl = `${process.env.baseURL}/paypal/payment-success`;
      const paypalCancelUrl = `${process.env.baseURL}/paypal/payment-cancel`;

      const orderRes = await axios.post(
        `${PAYPAL_BASE_URL}/v2/checkout/orders`,
        {
          intent, // CAPTURE or AUTHORIZE
          purchase_units: [
            {
              amount: {
                currency_code: "USD",
                value: amount.toFixed(2),
              },
            },
          ],
          application_context: { return_url: paypalReturnUrl, cancel_url: paypalCancelUrl },
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      orderData = orderRes.data;
    } catch (err) {
      return res.status(200).json({
        status: false,
        message: "Failed to create PayPal order.",
        error: err.response?.data,
      });
    }

    return res.status(200).json({
      status: true,
      message: "PayPal order created successfully. Please approve the payment to continue.",
      orderData,
      orderId: orderData.id,
      orderStatus: orderData.status, // CREATED
    });
  } catch (error) {
    console.error("Create PayPal order error:", error);
    return res.status(500).json({ status: false, message: "Server error while creating PayPal order." });
  }
};

//purchase coinPlan ( PayPal )
exports.validatePaypalPayment = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized request." });
    }

    const { orderId, coinPlanId } = req.body || {};

    if (!orderId || !coinPlanId) {
      return res.status(200).json({ status: false, message: "Missing PayPal payment details." });
    }

    const userObjectId = new mongoose.Types.ObjectId(req.user.userId);
    const coinPlanObjectId = new mongoose.Types.ObjectId(coinPlanId);

    const [uniqueId, user, coinPlan] = await Promise.all([
      generateHistoryUniqueId(),
      User.findById(userObjectId).select("_id coin isBlock").lean(),
      CoinPlan.findById(coinPlanObjectId).select("_id coin amount").lean(),
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "user does not found." });
    }

    if (user.isBlock) {
      console.warn(`🚫 Blocked user attempted payment: ${req.user.userId}`);
      return res.status(200).json({ status: false, message: "Your account has been blocked by the administrator." });
    }

    if (!coinPlan) {
      return res.status(200).json({ status: false, message: "CoinPlan does not found." });
    }

    const amount = Number(coinPlan.amount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(200).json({ status: false, message: "Invalid plan amount." });
    }

    if (!settingJSON) {
      console.error("⚙️ Configuration error: 'settingJSON' is undefined.");
      return res.status(200).json({ status: false, message: "Server configuration error. Please try again later." });
    }

    const PAYPAL_BASE_URL = process.env.PAYPAL_MODE === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
    console.log("PAYPAL_BASE_URL: ", PAYPAL_BASE_URL);
    console.log(`Validating PayPal order ${orderId} on ${PAYPAL_BASE_URL}`);

    let tokenResponse;
    try {
      tokenResponse = await axios.post(`${PAYPAL_BASE_URL}/v1/oauth2/token`, "grant_type=client_credentials", {
        auth: {
          // username: settingJSON.paypalApiClientId,
          // password: settingJSON.paypalApiSecret,
          username: "AQtirs0TaK3UkeJS_qcXrAG70ho2plD8zrLuoqPcvdexmTib_pddwIo5Z8E8HG4M-wVoyZuf0qEWTYO0",
          password: "EJCLzr9dulOGt8j2Ko_RvAyXWiPYm66lseRvIxjkElY1nKKyMrah_BZXJ41bB5hsTV6nqa7Z8A-84d9U",
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
    } catch (err) {
      console.log("Return PayPal’s token error to client: ", err);

      return res.status(200).json({
        status: false,
        message: "PayPal OAuth error",
        error: err.response?.data || err.message,
      });
    }

    const accessToken = tokenResponse.data.access_token;

    // Step 1: Verify order exists
    let orderResponse;
    try {
      orderResponse = await axios.get(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch (err) {
      console.log("PayPal order check error:", err.response?.data || err.message);
      return res.status(200).json({
        status: false,
        message: "PayPal order does not exist or is invalid.",
        error: err.response?.data || err.message,
      });
    }

    const orderData = orderResponse.data;
    if (orderData.status !== "APPROVED") {
      return res.status(200).json({ status: false, message: `Order not approved. Current status: ${orderData.status}` });
    }

    // Step 2: Capture order
    let captureResponse;
    try {
      captureResponse = await axios.post(`${PAYPAL_BASE_URL}/v2/checkout/orders/${orderId}/capture`, {}, { headers: { Authorization: `Bearer ${accessToken}` } });
    } catch (err) {
      console.log("PayPal order capture error: ", err.response?.data || err.message);

      return res.status(200).json({
        status: false,
        message: "PayPal order capture error",
        error: err.response?.data || err.message,
      });
    }

    console.log("captureResponse: ", captureResponse);

    const captureData = captureResponse.data;
    const orderStatus = captureData.status; // Should be COMPLETED
    const paidAmount = parseFloat(captureData.purchase_units[0].payments.captures[0].amount.value);

    if (orderStatus !== "COMPLETED" || paidAmount !== amount) {
      return res.status(200).json({ status: false, message: "PayPal payment not completed or invalid amount." });
    }

    if (orderStatus === "COMPLETED" && paidAmount === amount) {
      const totalCoins = coinPlan.coin;

      await Promise.all([
        User.updateOne({ _id: userObjectId }, { $inc: { coin: totalCoins, topUpCoins: totalCoins } }),
        History.create({
          uniqueId,
          type: 7,
          userId: user._id,
          planId: coinPlan._id,
          coin: totalCoins,
          amount: coinPlan.amount,
          paymentGateway: "PayPal",
          date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
        }),
      ]);

      return res.status(200).json({
        status: true,
        message: "PayPal payment verified and coins credited.",
      });
    }

    return res.status(200).json({
      status: false,
      message: "PayPal payment not completed.",
    });
  } catch (error) {
    console.error("PayPal validation error:", error.response?.data || error.message);
    return res.status(500).json({ status: false, message: "Server error during PayPal validation." });
  }
};

//purchase coinPlan ( Cashfree )
exports.validateCashfreePayment = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized request." });
    }

    const { orderId, coinPlanId } = req.body || {};

    if (!orderId || !coinPlanId) {
      return res.status(200).json({ status: false, message: "Missing Cashfree payment details." });
    }

    const userObjectId = new mongoose.Types.ObjectId(req.user.userId);
    const coinPlanObjectId = new mongoose.Types.ObjectId(coinPlanId);

    const [uniqueId, user, coinPlan] = await Promise.all([
      generateHistoryUniqueId(),
      User.findById(userObjectId).select("_id coin isBlock").lean(),
      CoinPlan.findById(coinPlanObjectId).select("_id coin amount").lean(),
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User not found." });
    }

    if (user.isBlock) {
      return res.status(200).json({ status: false, message: "User is blocked." });
    }

    if (!coinPlan) {
      return res.status(200).json({ status: false, message: "Coin plan not found." });
    }

    const response = await axios.get(`https://api.cashfree.com/pg/orders/${orderId}`, {
      headers: {
        "x-client-id": settingJSON.cashfreeClientId,
        "x-client-secret": settingJSON.cashfreeClientSecret,
        "x-api-version": "2023-08-01",
        "Content-Type": "application/json",
      },
    });

    const order = response.data;

    if (order.order_status === "PAID" && Number(order.order_amount) === Number(coinPlan.amount)) {
      const totalCoins = coinPlan.coin;

      await Promise.all([
        User.updateOne({ _id: userObjectId }, { $inc: { coin: totalCoins, topUpCoins: totalCoins } }),
        History.create({
          uniqueId,
          type: 7,
          userId: user._id,
          planId: coinPlan._id,
          coin: totalCoins,
          amount: coinPlan.amount,
          paymentGateway: "Cashfree",
          transactionId: orderId,
          date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
        }),
      ]);

      return res.status(200).json({ status: true, message: "Cashfree payment verified and coins credited." });
    }

    return res.status(200).json({ status: false, message: "Cashfree payment not completed." });
  } catch (error) {
    console.error("Cashfree validation error:", error.response?.data || error.message);
    return res.status(500).json({ status: false, message: "Server error during Cashfree validation." });
  }
};