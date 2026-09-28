const axios = require("axios");
const crypto = require("crypto");

const GameInfo = require("../../models/gameInfo.model");
const { default: mongoose } = require("mongoose");

const TEST_SERVER = settingJSON.baishunTestServer;
const PROD_SERVER = settingJSON.baishunProdServer;
const APP_KEY = settingJSON.baishunAppKey;
const APP_CHANNEL = settingJSON.baishunAppChannel;
const APP_ID = Number(settingJSON.baishunAppId);
const REQUEST_TIMEOUT_MS = 15000;

const getBaseUrl = () => {
  const isTestMode = settingJSON.isThirdPartyGameEnabled === true;
  return (isTestMode ? TEST_SERVER : PROD_SERVER).replace(/\/$/, "");
};

const generateSignatureNonce = () => crypto.randomBytes(8).toString("hex");

const generateSignature = (signatureNonce, timestamp) => {
  return crypto.createHash("md5").update(`${signatureNonce}${APP_KEY}${timestamp}`).digest("hex").toLowerCase();
};

const toNumber = (value, defaultValue = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : defaultValue;
};

const createSignedPayload = (gameListType) => {
  const signatureNonce = generateSignatureNonce();
  const timestamp = Math.floor(Date.now() / 1000);

  return {
    game_list_type: gameListType,
    app_channel: APP_CHANNEL,
    app_id: APP_ID,
    signature: generateSignature(signatureNonce, timestamp),
    signature_nonce: signatureNonce,
    timestamp,
  };
};

const fetchThirdPartyGameList = async (gameListType) => {
  const url = `${getBaseUrl()}/v1/api/gamelist`;
  const payload = createSignedPayload(gameListType);
  const response = await axios.post(url, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: REQUEST_TIMEOUT_MS,
  });

  if (!response.data || response.data.code !== 0 || !Array.isArray(response.data.data)) {
    const message = response.data?.message || "Third-party game list API returned an invalid response.";
    throw new Error(message);
  }

  return response.data.data;
};

const normalizeGameInfo = (game, syncedAt) => {
  return {
    gameId: toNumber(game.game_id ?? game.gameId),
    name: game.name || "",
    previewUrl: game.preview_url || game.previewUrl || "",
    gameVersion: game.game_version || game.gameVersion || "",
    downloadUrl: game.download_url || game.downloadUrl || "",
    lastSyncedAt: syncedAt,
    isActive: true,
  };
};

// sync third party games
exports.syncThirdPartyGames = async (req, res) => {
  try {
    const gameListType = 3;

    const thirdPartyGames = await fetchThirdPartyGameList(gameListType);
    const syncedAt = new Date();
    const games = thirdPartyGames.map((game) => normalizeGameInfo(game, syncedAt));

    await Promise.all(games.map((game) => new GameInfo(game).validate()));

    const previousCount = await GameInfo.countDocuments();
    await GameInfo.deleteMany({});

    if (games.length > 0) {
      await GameInfo.insertMany(games, { ordered: true });
    }

    return res.status(200).json({
      status: true,
      message: "Third-party games synced successfully.",
      previousCount,
      syncedCount: games.length,
      data: games,
    });
  } catch (error) {
    console.error("Error syncing third-party games:", error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

// get all third party game info
exports.fetchGameInfoList = async (req, res) => {
  try {
    const start = parseInt(req.query.start) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (start - 1) * limit;

    const gameInfoList = await GameInfo.aggregate([
      {
        $facet: {
          data: [{ $sort: { gameId: 1 } }, { $skip: skip }, { $limit: limit }],
          totalCount: [{ $count: "count" }],
        },
      },
    ]);

    const data = gameInfoList[0]?.data || [];
    const total = gameInfoList[0]?.totalCount[0]?.count || 0;

    return res.status(200).json({
      status: true,
      message: "Game info retrieved successfully.",
      total,
      data,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

// third party game active/inactive
exports.toggleGameInfoStatus = async (req, res) => {
  try {
    const { gameInfoId } = req.query;

    if (!gameInfoId) {
      return res.status(200).json({ status: false, message: "gameInfoId is required." });
    }

    if (!mongoose.Types.ObjectId.isValid(gameInfoId)) {
      return res.status(200).json({ status: false, message: "Invalid gameInfoId." });
    }

    const gameInfo = await GameInfo.findById(gameInfoId);
    if (!gameInfo) {
      return res.status(200).json({ status: false, message: "Game info not found." });
    }

    gameInfo.isActive = !gameInfo.isActive;
    await gameInfo.save();

    const message = gameInfo.isActive ? "Third party game activated successfully!" : "Third party game deactivated successfully!";

    return res.status(200).json({
      status: true,
      message,
      data: gameInfo,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};
