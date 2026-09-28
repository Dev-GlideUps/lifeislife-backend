//express
const express = require("express");
const app = express();

//cors
const cors = require("cors");
app.use(cors());
app.use(express.json());

app.set("trust proxy", true);

//logging middleware
const logger = require("morgan");
app.use(logger("dev"));

// Detailed request/response logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();

  // Log incoming request
  console.log("\n" + "=".repeat(80));
  console.log(`📥 INCOMING REQUEST`);
  console.log(`🕐 Time: ${new Date().toISOString()}`);
  console.log(`🔹 Method: ${req.method}`);
  console.log(`🔹 URL: ${req.originalUrl}`);
  console.log(`🔹 IP: ${req.ip || req.connection.remoteAddress}`);

  if (Object.keys(req.query).length > 0) {
    console.log(`🔹 Query:`, JSON.stringify(req.query, null, 2));
  }

  if (req.body && Object.keys(req.body).length > 0) {
    // Hide sensitive fields
    const sanitizedBody = { ...req.body };
    if (sanitizedBody.password) sanitizedBody.password = "***HIDDEN***";
    if (sanitizedBody.token) sanitizedBody.token = "***HIDDEN***";
    if (sanitizedBody.fcmToken) sanitizedBody.fcmToken = "***HIDDEN***";
    console.log(`🔹 Body:`, JSON.stringify(sanitizedBody, null, 2));
  }

  // Capture response
  const originalSend = res.send;
  res.send = function (body) {
    const duration = Date.now() - startTime;

    console.log(`\n📤 RESPONSE`);
    console.log(`🔹 Status: ${res.statusCode}`);
    console.log(`🔹 Duration: ${duration}ms`);

    // Log response body (limit size)
    try {
      const parsedBody = typeof body === "string" ? JSON.parse(body) : body;
      const responseStr = JSON.stringify(parsedBody, null, 2);
      if (responseStr.length > 1000) {
        console.log(`🔹 Response: ${responseStr.substring(0, 1000)}... [TRUNCATED]`);
      } else {
        console.log(`🔹 Response:`, responseStr);
      }
    } catch (e) {
      console.log(`🔹 Response: [Non-JSON response]`);
    }

    console.log("=".repeat(80) + "\n");

    return originalSend.call(this, body);
  };

  next();
});

//path
const path = require("path");

//fs
const fs = require("fs");

//dotenv
require("dotenv").config({ path: ".env" });

//socket io
const http = require("http");
const server = http.createServer(app);
global.io = require("socket.io")(server);

//connection.js
const db = require("./util/connection");

//Declare global variable
global.settingJSON = {};

//Declare the function as a global variable to update the setting.js file
global.updateSettingFile = (settingData) => {
  const settingJSON = JSON.stringify(settingData, null, 2);
  fs.writeFileSync("setting.js", `module.exports = ${settingJSON};`, "utf8");

  global.settingJSON = settingData; // Update global variable
  console.log("Settings file updated.");
};

//Step 1: Import initializeSettings
const initializeSettings = require("./util/initializeSettings");

async function startServer() {
  console.log("🔄 Initializing settings...");
  await initializeSettings();
  console.log("✅ Settings Loaded");

  //Step 2: Require all other modules after settings are initialized
  const routes = require("./routes/route");
  app.use("/api", routes);

  require("./socket");

  app.get("/.well-known/assetlinks.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json(global?.settingJSON?.androidAssetLinks || []);
  });

  app.get("/.well-known/apple-app-site-association", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json(global?.settingJSON?.appleAppSiteAssociation || {});
  });

  app.use("/storage", express.static(path.join(__dirname, "storage")));
  app.use("/svga", express.static(path.join(__dirname, "svga")));

  db.on("error", () => {
    console.log("Connection Error: ");
  });

  db.once("open", async () => {
    console.log("Mongo: successfully connected to db");
  });

  //Step 3: Start Server after all setup is done
  server.listen(process?.env?.PORT, () => {
    console.log("Hello World ! listening on " + process?.env?.PORT);
  });
}

//Run server startup
startServer();

const cron = require("node-cron");
const PurchasedItem = require("./models/purchasedItem.model");
const User = require("./models/user.model");

cron.schedule("0 0 * * *", async () => {
  try {
    console.log("Running expiry cleanup job... schedule a cron job to run every day at night, exactly at 12:00 AM (midnight)");

    const now = new Date();

    const expiredItems = await PurchasedItem.find({
      expiryDate: { $lt: now },
    });

    for (const item of expiredItems) {
      const update = {};

      if (item.itemType === 1) {
        update.activeTheme = null;
      } else if (item.itemType === 2) {
        update.activeAvtarFrame = null;
      } else if (item.itemType === 3) {
        update.activeRide = null;
      }

      if (Object.keys(update).length > 0) {
        await User.updateOne({ _id: item.userId }, { $set: update });
      }
    }
  } catch (error) {
    console.error("Error in expiry cleanup job:", error);
  }
});

const mongoose = require("mongoose");
const generateHistoryUniqueId = require("./util/generateHistoryUniqueId");
const History = require("./models/history.model");
const GameInfo = require("./models/gameInfo.model");
const { HISTORY_TYPE } = require("./types/constant");

app.post("/api/user/info", async (req, res) => {
  try {
    console.log("POST /api/user/info hit with body:", req.body);

    const uniqueId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const user_id = req.body.user_id || "";

    if (!mongoose.Types.ObjectId.isValid(user_id)) {
      console.warn("Invalid user_id received in /api/user/info:", user_id);

      return res.status(400).json({
        code: 400,
        message: "Invalid user_id",
        unique_id: uniqueId,
        data: null,
      });
    }

    const user = await User.findOne({ _id: user_id }).select("name image coin");

    if (!user) {
      console.warn("User not found for user_id in /api/user/info:", user_id);

      return res.status(404).json({
        code: 404,
        message: "User not found",
        unique_id: uniqueId,
        data: null,
      });
    }

    const responseData = {
      code: 0,
      message: "succeed",
      unique_id: uniqueId,
      data: {
        user_id,
        user_name: user.name || "",
        user_avatar: user.image || "",
        balance: user.coin || 0,
      },
    };

    console.log("response in /api/user/info:", responseData);

    return res.status(200).json(responseData);
  } catch (error) {
    console.error("Error in /api/user/info:", error);
    return res.status(500).json({
      code: 500,
      message: "Internal Server Error",
      data: null,
    });
  }
});

app.post("/api/user/balance/change", async (req, res) => {
  try {
    console.log("POST /api/user/balance/change hit with body:", req.body);

    const uniqueId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const { user_id, currency_diff, game_id } = req.body;
    const numericDiff = Number(currency_diff);
    const numericGameId = Number(game_id);

    if (!mongoose.Types.ObjectId.isValid(user_id)) {
      console.warn("Invalid user_id in /api/user/balance/change:", user_id);

      return res.status(400).json({
        code: 400,
        message: "Invalid user_id",
        unique_id: uniqueId,
        data: null,
      });
    }

    if (!Number.isFinite(numericDiff)) {
      console.warn("Invalid currency_diff in /api/user/balance/change:", currency_diff);

      return res.status(400).json({
        code: 400,
        message: "currency_diff must be a number",
        unique_id: uniqueId,
        data: null,
      });
    }

    const [user, historyId, gameInfo] = await Promise.all([
      User.findById(user_id).select("name image coin"),
      generateHistoryUniqueId(),
      Number.isFinite(numericGameId) ? GameInfo.findOne({ gameId: numericGameId }).lean() : null,
    ]);

    if (!user) {
      console.warn("User not found for user_id in /api/user/balance/change:", user_id);

      return res.status(404).json({
        code: 404,
        message: "User not found",
        unique_id: uniqueId,
        data: null,
      });
    }

    if (numericDiff < 0 && user.coin + numericDiff < 0) {
      console.warn("Insufficient balance in /api/user/balance/change:", {
        currentCoin: user.coin,
        currency_diff: numericDiff,
      });

      return res.status(200).json({
        code: 1008,
        message: "Insufficient balance",
        unique_id: uniqueId,
        data: null,
      });
    } //If user had coin = 50 and currency_diff = -100 → error 1008

    const updatedUser = await User.findByIdAndUpdate(user_id, { $inc: { coin: numericDiff } }, { new: true, select: "coin" });

    const responseData = {
      code: 0,
      message: "succeed",
      unique_id: uniqueId,
      data: {
        currency_balance: updatedUser.coin,
      },
    };

    res.status(200).json(responseData);

    console.log("response in /api/user/balance/change:", responseData);

    const highCoinValue = settingJSON?.coinGameThreshold || 1000;

    if (numericDiff > 0 && numericDiff >= highCoinValue) {
      console.log("✅ Emits highCoinWin");

      const gameName = gameInfo?.name || "the game";
      const message = `🎯 ${user.name} just won 🪙 ${numericDiff} coins in ${gameName}! 🔥`;
      const payload = {
        message,
        userImage: user?.image,
      };
      io.emit("highCoinWinBroadcast", payload); // ✅ emits to all connected clients
    }

    if (numericDiff !== 0) {
      const gameName = gameInfo?.name || "the game";

      const walletHistory = {
        uniqueId: historyId,
        type: HISTORY_TYPE.THIRD_PARTY_GAME,
        date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
        coin: Math.abs(numericDiff),
        thirdPartyGameId: Number.isFinite(numericGameId) ? numericGameId : 0,
        thirdPartyGameName: gameName,
      };

      if (numericDiff > 0) {
        walletHistory.otherUserId = user_id;
      } else {
        walletHistory.userId = user_id;
      }

      await History(walletHistory).save();
      console.log("Wallet history saved:", walletHistory);
    }
  } catch (error) {
    console.error("Error in /api/user/balance/change:", error);
    if (res.headersSent) {
      return;
    }
    return res.status(500).json({ status: false, message: "Internal Server Error" });
  }
});

app.post("/api/user/ss-token", async (req, res) => {
  try {
    console.log("POST /api/user/ss-token hit with req:", req.body);

    const uniqueId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const expireDate = Date.now() + 24 * 60 * 60 * 1000; // 24 hours in ms
    const ss_token = req.body.code || "";

    const response = {
      code: 0,
      message: "succeed",
      unique_id: uniqueId,
      data: {
        ss_token: ss_token,
        expire_date: expireDate,
      },
    };

    console.log("response in /api/user/ss-token:", response);

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error in /api/user/ss-token:", error);
    return res.status(500).json({
      code: -1,
      message: "Internal Server Error",
    });
  }
});

app.post("/api/user/update-sstoken", async (req, res) => {
  try {
    console.log("POST /api/user/update-sstoken hit with body:", req.body);

    return res.status(200).json({ status: true, message: "SS Token updated" });
  } catch (error) {
    console.error("Error in /api/user/update-sstoken:", error);
    return res.status(500).json({ status: false, message: "Internal Server Error" });
  }
});
