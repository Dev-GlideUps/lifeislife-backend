const PurchasedItem = require("../../models/purchasedItem.model");

//import model
const AvtarFrame = require("../../models/avtarFrame.model");
const Theme = require("../../models/theme.model");
const Ride = require("../../models/ride.model");
const User = require("../../models/user.model");
const History = require("../../models/history.model");

//mongoose
const mongoose = require("mongoose");

//private key
const admin = require("../../util/privateKey");

//generateHistoryUniqueId
const generateHistoryUniqueId = require("../../util/generateHistoryUniqueId");

const { ITEM_TYPE, HISTORY_TYPE } = require("../../types/constant");

//fetching Avatar Frames, Themes, Rides
exports.listStoreItems = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const now = new Date();

    const [themes, avatarFrames, rides] = await Promise.all([
      Theme.aggregate([
        {
          $match: {
            isActive: true,
            isDelete: false,
          },
        },
        { $sort: { createdAt: -1 } },
        { $skip: (start - 1) * limit },
        { $limit: limit },
        {
          $lookup: {
            from: "purchaseditems",
            localField: "_id",
            foreignField: "theme",
            pipeline: [{ $match: { userId: userId } }],
            as: "purchasedInfo",
          },
        },
        {
          $addFields: {
            type: 0,
            isPurchased: { $gt: [{ $size: "$purchasedInfo" }, 0] },
            isExpired: {
              $cond: [
                {
                  $gt: [
                    {
                      $size: {
                        $filter: {
                          input: "$purchasedInfo",
                          as: "item",
                          cond: {
                            $or: [{ $eq: ["$$item.expiryDate", null] }, { $gt: ["$$item.expiryDate", now] }],
                          },
                        },
                      },
                    },
                    0,
                  ],
                },
                false,
                true,
              ],
            },
            svgaImage: "",
          },
        },
        {
          $project: {
            name: 1,
            image: 1,
            coin: 1,
            validity: 1,
            validityType: 1,
            type: 1,
            svgaImage: 1,
            createdAt: 1,
            isPurchased: 1,
            isExpired: 1,
            expiryDate: 1,
          },
        },
      ]),
      AvtarFrame.aggregate([
        {
          $match: {
            isActive: true,
            isDelete: false,
          },
        },
        { $sort: { createdAt: -1 } },
        { $skip: (start - 1) * limit },
        { $limit: limit },
        {
          $lookup: {
            from: "purchaseditems",
            localField: "_id",
            foreignField: "avtarFrame",
            pipeline: [{ $match: { userId: userId } }],
            as: "purchasedInfo",
          },
        },
        {
          $addFields: {
            isPurchased: { $gt: [{ $size: "$purchasedInfo" }, 0] },
            isExpired: {
              $cond: [
                {
                  $gt: [
                    {
                      $size: {
                        $filter: {
                          input: "$purchasedInfo",
                          as: "item",
                          cond: {
                            $or: [{ $eq: ["$$item.expiryDate", null] }, { $gt: ["$$item.expiryDate", now] }],
                          },
                        },
                      },
                    },
                    0,
                  ],
                },
                false,
                true,
              ],
            },
          },
        },
        {
          $project: {
            name: 1,
            image: 1,
            coin: 1,
            validity: 1,
            validityType: 1,
            type: 1,
            svgaImage: 1,
            createdAt: 1,
            isPurchased: 1,
            isExpired: 1,
            expiryDate: 1,
          },
        },
      ]),
      Ride.aggregate([
        {
          $match: {
            isActive: true,
            isDelete: false,
          },
        },
        { $sort: { createdAt: -1 } },
        { $skip: (start - 1) * limit },
        { $limit: limit },
        {
          $lookup: {
            from: "purchaseditems",
            localField: "_id",
            foreignField: "ride",
            pipeline: [{ $match: { userId: userId } }],
            as: "purchasedInfo",
          },
        },
        {
          $addFields: {
            isPurchased: { $gt: [{ $size: "$purchasedInfo" }, 0] },
            isExpired: {
              $cond: [
                {
                  $gt: [
                    {
                      $size: {
                        $filter: {
                          input: "$purchasedInfo",
                          as: "item",
                          cond: {
                            $or: [{ $eq: ["$$item.expiryDate", null] }, { $gt: ["$$item.expiryDate", now] }],
                          },
                        },
                      },
                    },
                    0,
                  ],
                },
                false,
                true,
              ],
            },
          },
        },
        {
          $project: {
            name: 1,
            image: 1,
            coin: 1,
            validity: 1,
            validityType: 1,
            type: 1,
            svgaImage: 1,
            createdAt: 1,
            isPurchased: 1,
            isExpired: 1,
            expiryDate: 1,
          },
        },
      ]),
    ]);

    return res.status(200).json({
      status: true,
      message: "Retrieved store items successfully.",
      data: {
        avatarFrames,
        themes,
        rides,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//purchasing a Theme, Avatar Frame, Ride, or Chat Bubble
exports.executePurchaseItem = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const { itemId, itemType, directWear } = req.query;

    if (!itemId || !itemType || !["true", "false"].includes(String(directWear).toLowerCase())) {
      return res.status(200).json({
        status: false,
        message: "Oops! Invalid details!",
      });
    }

    const isDirectWear = directWear.toLowerCase() === "true";

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const numItemType = Number(itemType);

    let Model;
    if (itemType == ITEM_TYPE.THEME) Model = Theme;
    else if (itemType == ITEM_TYPE.AVTARFRAME) Model = AvtarFrame;
    else if (itemType == ITEM_TYPE.RIDE) Model = Ride;
    else return res.status(200).json({ status: false, message: "Invalid itemType." });

    const purchaseFields = {
      [ITEM_TYPE.THEME]: "theme",
      [ITEM_TYPE.AVTARFRAME]: "avtarFrame",
      [ITEM_TYPE.RIDE]: "ride",
    };

    const purchaseField = purchaseFields[numItemType];

    const [uniqueId, user, item, existingPurchase] = await Promise.all([
      generateHistoryUniqueId(),
      User.findOne({ _id: userId, isBlock: false }).select("_id fcmToken isBlock isPushNotificationEnabled coin").lean(),
      Model.findById(itemId).select("coin validity validityType name isActive").lean(),
      PurchasedItem.findOne({
        userId,
        itemType: numItemType,
        [purchaseField]: itemId,
      }).lean(),
    ]);

    if (!user) {
      return res.status(200).json({ status: false, message: "User does not exist." });
    }

    if (!item || !item.isActive) {
      return res.status(200).json({ status: false, message: "Theme or Frame not available." });
    }

    if (existingPurchase) {
      const now = new Date();
      if (existingPurchase.expiryDate && existingPurchase.expiryDate > now) {
        return res.status(200).json({ status: false, message: "You have already purchased this item, and it is still active." });
      } else {
        await PurchasedItem.deleteOne({ _id: existingPurchase._id });
      }
    }

    if (user.coin < item.coin) {
      return res.status(200).json({ status: false, message: "Insufficient coins for purchase." });
    }

    res.status(200).json({ status: true, message: "Item purchased successfully!" });

    let expiryDate = new Date();
    if (item.validityType == 1) expiryDate.setDate(expiryDate.getDate() + item.validity);
    if (item.validityType == 2) expiryDate.setMonth(expiryDate.getMonth() + item.validity);
    if (item.validityType == 3) expiryDate.setFullYear(expiryDate.getFullYear() + item.validity);

    const purchaseData = { userId, itemType, expiryDate };
    if (itemType == ITEM_TYPE.THEME) purchaseData.theme = itemId;
    if (itemType == ITEM_TYPE.AVTARFRAME) purchaseData.avtarFrame = itemId;
    if (itemType == ITEM_TYPE.RIDE) purchaseData.ride = itemId;

    const historyTypeByItem = {
      [ITEM_TYPE.THEME]: HISTORY_TYPE.PURCHASE_THEME,
      [ITEM_TYPE.AVTARFRAME]: HISTORY_TYPE.PURCHASE_AVTARFRAME,
      [ITEM_TYPE.RIDE]: HISTORY_TYPE.PURCHASE_RIDE,
    };

    const historyData = {
      uniqueId,
      userId,
      coin: item.coin,
      type: historyTypeByItem[numItemType],
      date: new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
    };

    if (itemType == ITEM_TYPE.THEME) {
      historyData.themeId = itemId;
      historyData.themeName = item.name;
      historyData.themeValidity = item.validity;
      historyData.themeValidityType = item.validityType;
    }

    if (itemType == ITEM_TYPE.AVTARFRAME) {
      historyData.avtarFrameId = itemId;
      historyData.avtarFrameName = item.name;
      historyData.avtarFrameValidity = item.validity;
      historyData.avtarFrameValidityType = item.validityType;
    }

    if (itemType == ITEM_TYPE.RIDE) {
      historyData.rideId = itemId;
      historyData.rideName = item.name;
      historyData.rideValidity = item.validity;
      historyData.rideValidityType = item.validityType;
    }

    await Promise.all([
      new PurchasedItem(purchaseData).save(),
      User.updateOne(
        { _id: userId, coin: { $gte: item.coin } },
        { $inc: { coin: -item.coin } }, // update operation
      ),
      History.create(historyData),
    ]);

    if (itemType == ITEM_TYPE.THEME && isDirectWear) {
      await User.findByIdAndUpdate(userId, { activeTheme: itemId });
    }

    if (itemType == ITEM_TYPE.AVTARFRAME && isDirectWear) {
      await User.findByIdAndUpdate(userId, { activeAvtarFrame: itemId });
    }

    if (itemType == ITEM_TYPE.RIDE && isDirectWear) {
      await User.findByIdAndUpdate(userId, { activeRide: itemId });
    }

    if (user && !user.isBlock && user.isPushNotificationEnabled && user.fcmToken !== null) {
      const payload = {
        token: user.fcmToken,
        notification: {
          title: "🚀 Purchase Confirmed! Time to Enjoy!",
          body: "🎊 Your purchase is complete! Enjoy your new item and have a great experience. 🛍️✨",
        },
        data: {
          type: "PURCHASE_CONFIRMATION",
        },
      };

      const adminPromise = await admin;
      adminPromise
        .messaging()
        .send(payload)
        .then(async (response) => {
          console.log("Notification sent successfully:", response);
        })
        .catch((error) => {
          console.error("Error sending notification:", error);
        });
    }
  } catch (error) {
    console.error("Error in executePurchaseItem:", error);
    return res.status(500).json({ status: false, message: "Internal Server Error." });
  }
};

//wear or take off item
exports.wearOrTakeOffItem = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const { itemId, itemType, action } = req.query;

    const numItemType = Number(itemType);

    if (!itemId || ![ITEM_TYPE.THEME, ITEM_TYPE.AVTARFRAME, ITEM_TYPE.RIDE].includes(numItemType) || !["wear", "takeOff"].includes(action)) {
      return res.status(200).json({ status: false, message: "Missing or invalid parameters." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);

    const models = {
      [ITEM_TYPE.THEME]: Theme,
      [ITEM_TYPE.AVTARFRAME]: AvtarFrame,
      [ITEM_TYPE.RIDE]: Ride,
    };

    const modelFields = {
      [ITEM_TYPE.THEME]: "activeTheme",
      [ITEM_TYPE.AVTARFRAME]: "activeAvtarFrame",
      [ITEM_TYPE.RIDE]: "activeRide",
    };

    const purchaseFields = {
      [ITEM_TYPE.THEME]: "theme",
      [ITEM_TYPE.AVTARFRAME]: "avtarFrame",
      [ITEM_TYPE.RIDE]: "ride",
    };

    const model = models[numItemType];
    const fieldToUpdate = modelFields[numItemType];
    const purchaseField = purchaseFields[numItemType];

    const [item, purchasedItem] = await Promise.all([
      model.findById(itemId).select("_id isActive").lean(),
      PurchasedItem.findOne({
        userId,
        itemType: numItemType,
        [purchaseField]: itemId,
      }).lean(),
    ]);

    if (!item || !item.isActive) {
      return res.status(200).json({ status: false, message: "Item not found or inactive." });
    }

    if (!purchasedItem) {
      return res.status(200).json({ status: false, message: "You have not purchased this item." });
    }

    res.status(200).json({
      status: true,
      message: action === "wear" ? "Item applied successfully." : "Item removed successfully.",
    });

    const updateData = {};
    updateData[fieldToUpdate] = action === "wear" ? itemId : null;

    await User.findByIdAndUpdate(userId, updateData);
  } catch (error) {
    console.error("Error in wearOrTakeOffItem:", error);
    return res.status(500).json({ status: false, message: "Internal Server Error." });
  }
};

//get purchased Avatar Frames, Themes, Rides, and Chat Bubbles
exports.listUserPurchasedItems = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const now = new Date();

    const [themesRaw, avatarFramesRaw, ridesRaw] = await Promise.all([
      PurchasedItem.aggregate([
        { $match: { userId, itemType: 1 } },
        { $sort: { purchaseDate: -1 } },
        { $skip: (start - 1) * limit },
        { $limit: limit },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "userData",
          },
        },
        { $unwind: "$userData" },
        {
          $lookup: {
            from: "themes",
            localField: "theme",
            foreignField: "_id",
            as: "themeData",
          },
        },
        { $unwind: "$themeData" },
        {
          $match: {
            "themeData.isDelete": false,
            "themeData.isActive": true,
          },
        },
        {
          $addFields: {
            isExpired: {
              $cond: [{ $or: [{ $eq: ["$expiryDate", null] }, { $gt: ["$expiryDate", now] }] }, false, true],
            },
            isSelected: {
              $eq: ["$theme", "$userData.activeTheme"],
            },
          },
        },
        {
          $project: {
            _id: 0,
            purchaseDate: 1,
            expiryDate: 1,
            isExpired: 1,
            isSelected: 1,
            type: { $literal: 0 },
            svgaImage: { $literal: "" },
            itemId: "$themeData._id",
            image: "$themeData.image",
            name: "$themeData.name",
            coin: "$themeData.coin",
          },
        },
      ]),
      PurchasedItem.aggregate([
        { $match: { userId, itemType: 2 } },
        { $sort: { purchaseDate: -1 } },
        { $skip: (start - 1) * limit },
        { $limit: limit },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "userData",
          },
        },
        { $unwind: "$userData" },
        {
          $lookup: {
            from: "avtarframes",
            localField: "avtarFrame",
            foreignField: "_id",
            as: "avtarFrameData",
          },
        },
        { $unwind: "$avtarFrameData" },
        {
          $match: {
            "avtarFrameData.isDelete": false,
            "avtarFrameData.isActive": true,
          },
        },
        {
          $addFields: {
            isExpired: {
              $cond: [{ $or: [{ $eq: ["$expiryDate", null] }, { $gt: ["$expiryDate", now] }] }, false, true],
            },
            isSelected: {
              $eq: ["$avtarFrame", "$userData.activeAvtarFrame"],
            },
          },
        },
        {
          $project: {
            _id: 0,
            purchaseDate: 1,
            expiryDate: 1,
            isExpired: 1,
            isSelected: 1,
            itemId: "$avtarFrameData._id",
            type: "$avtarFrameData.type",
            image: "$avtarFrameData.image",
            svgaImage: "$avtarFrameData.svgaImage",
            name: "$avtarFrameData.name",
            coin: "$avtarFrameData.coin",
          },
        },
      ]),
      PurchasedItem.aggregate([
        { $match: { userId, itemType: 3 } },
        { $sort: { purchaseDate: -1 } },
        { $skip: (start - 1) * limit },
        { $limit: limit },
        {
          $lookup: {
            from: "users",
            localField: "userId",
            foreignField: "_id",
            as: "userData",
          },
        },
        { $unwind: "$userData" },
        {
          $lookup: {
            from: "rides",
            localField: "ride",
            foreignField: "_id",
            as: "rideData",
          },
        },
        { $unwind: "$rideData" },
        {
          $match: {
            "rideData.isDelete": false,
            "rideData.isActive": true,
          },
        },
        {
          $addFields: {
            isExpired: {
              $cond: [{ $or: [{ $eq: ["$expiryDate", null] }, { $gt: ["$expiryDate", now] }] }, false, true],
            },
            isSelected: {
              $eq: ["$ride", "$userData.activeRide"],
            },
          },
        },
        {
          $project: {
            _id: 0,
            purchaseDate: 1,
            expiryDate: 1,
            isExpired: 1,
            isSelected: 1,
            itemId: "$rideData._id",
            type: "$rideData.type",
            image: "$rideData.image",
            svgaImage: "$rideData.svgaImage",
            name: "$rideData.name",
            coin: "$rideData.coin",
          },
        },
      ]),
    ]);

    const splitByStatus = (items) => ({
      active: items.filter((item) => !item.isExpired),
      expired: items.filter((item) => item.isExpired),
    });

    return res.status(200).json({
      status: true,
      message: "Retrieved user-purchased items successfully.",
      data: {
        themes: splitByStatus(themesRaw),
        avatarFrames: splitByStatus(avatarFramesRaw),
        rides: splitByStatus(ridesRaw),
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get purchased Themes
exports.getUserPurchasedThemes = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const start = req.query.start ? parseInt(req.query.start) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : 20;
    const now = new Date();

    const purchasedThemes = await PurchasedItem.aggregate([
      { $match: { userId, itemType: 1 } },
      {
        $addFields: {
          isExpired: {
            $cond: [{ $or: [{ $eq: ["$expiryDate", null] }, { $gt: ["$expiryDate", now] }] }, false, true],
          },
        },
      },
      { $match: { isExpired: false } },
      { $sort: { purchaseDate: -1 } },
      { $skip: (start - 1) * limit },
      { $limit: limit },
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "userData",
        },
      },
      { $unwind: "$userData" },
      {
        $lookup: {
          from: "themes",
          localField: "theme",
          foreignField: "_id",
          as: "themeData",
        },
      },
      { $unwind: "$themeData" },
      {
        $match: {
          "themeData.isDelete": false,
          "themeData.isActive": true,
        },
      },
      {
        $addFields: {
          isSelected: {
            $eq: ["$theme", "$userData.activeTheme"],
          },
        },
      },
      {
        $project: {
          _id: 0,
          themeId: "$themeData._id",
          image: "$themeData.image",
          svgaImage: "$themeData.svgaImage",
          isSelected: 1,
        },
      },
    ]);

    return res.status(200).json({
      status: true,
      message: "User purchased themes retrieved successfully.",
      data: purchasedThemes,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get recommended items and top 3 most purchased avatarFrames
exports.getRecommendations = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({ status: false, message: "Unauthorized access. Invalid token." });
    }

    const userId = new mongoose.Types.ObjectId(req.user.userId);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [topFrames, themes, frames, rides] = await Promise.all([
      PurchasedItem.aggregate([
        {
          $match: {
            itemType: 2,
            purchaseDate: { $gte: startOfMonth },
          },
        },
        {
          $group: {
            _id: "$avtarFrame",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 3 },
        {
          $lookup: {
            from: "avtarframes",
            localField: "_id",
            foreignField: "_id",
            pipeline: [
              { $match: { isActive: true, isDelete: false } },
              {
                $lookup: {
                  from: "purchaseditems",
                  localField: "_id",
                  foreignField: "avtarFrame",
                  pipeline: [{ $match: { userId: userId } }],
                  as: "purchasedInfo",
                },
              },
              {
                $addFields: {
                  isPurchased: { $gt: [{ $size: "$purchasedInfo" }, 0] },
                  isExpired: {
                    $cond: [
                      {
                        $gt: [
                          {
                            $size: {
                              $filter: {
                                input: "$purchasedInfo",
                                as: "item",
                                cond: {
                                  $or: [{ $eq: ["$$item.expiryDate", null] }, { $gt: ["$$item.expiryDate", now] }],
                                },
                              },
                            },
                          },
                          0,
                        ],
                      },
                      false,
                      true,
                    ],
                  },
                },
              },
            ],
            as: "frame",
          },
        },
        { $unwind: "$frame" },
        { $replaceRoot: { newRoot: "$frame" } },
        {
          $project: {
            _id: 1,
            name: 1,
            type: 1,
            image: 1,
            svgaImage: 1,
            coin: 1,
            validity: 1,
            validityType: 1,
            isPurchased: 1,
            isExpired: 1,
            expiryDate: 1,
          },
        },
      ]),
      Theme.aggregate([
        {
          $match: {
            isActive: true,
            isDelete: false,
            isRecommended: true,
          },
        },
        {
          $lookup: {
            from: "purchaseditems",
            localField: "_id",
            foreignField: "theme",
            pipeline: [{ $match: { userId: userId } }],
            as: "purchasedInfo",
          },
        },
        {
          $addFields: {
            isPurchased: { $gt: [{ $size: "$purchasedInfo" }, 0] },
            isExpired: {
              $cond: [
                {
                  $gt: [
                    {
                      $size: {
                        $filter: {
                          input: "$purchasedInfo",
                          as: "item",
                          cond: {
                            $or: [{ $eq: ["$$item.expiryDate", null] }, { $gt: ["$$item.expiryDate", now] }],
                          },
                        },
                      },
                    },
                    0,
                  ],
                },
                false,
                true,
              ],
            },
            itemType: "theme",
            svgaImage: "",
          },
        },
        {
          $project: {
            name: 1,
            image: 1,
            coin: 1,
            type: 1,
            validity: 1,
            validityType: 1,
            itemType: 1,
            svgaImage: 1,
            isPurchased: 1,
            isExpired: 1,
            expiryDate: 1,
          },
        },
      ]),
      AvtarFrame.aggregate([
        {
          $match: {
            isActive: true,
            isDelete: false,
            isRecommended: true,
          },
        },
        {
          $lookup: {
            from: "purchaseditems",
            localField: "_id",
            foreignField: "avtarFrame",
            pipeline: [{ $match: { userId: userId } }],
            as: "purchasedInfo",
          },
        },
        {
          $addFields: {
            isPurchased: { $gt: [{ $size: "$purchasedInfo" }, 0] },
            isExpired: {
              $cond: [
                {
                  $gt: [
                    {
                      $size: {
                        $filter: {
                          input: "$purchasedInfo",
                          as: "item",
                          cond: {
                            $or: [{ $eq: ["$$item.expiryDate", null] }, { $gt: ["$$item.expiryDate", now] }],
                          },
                        },
                      },
                    },
                    0,
                  ],
                },
                false,
                true,
              ],
            },
            itemType: "frame",
          },
        },
        {
          $project: {
            name: 1,
            image: 1,
            coin: 1,
            type: 1,
            validity: 1,
            validityType: 1,
            svgaImage: 1,
            itemType: 1,
            isPurchased: 1,
            isExpired: 1,
            expiryDate: 1,
          },
        },
      ]),
      Ride.aggregate([
        {
          $match: {
            isActive: true,
            isDelete: false,
            isRecommended: true,
          },
        },
        {
          $lookup: {
            from: "purchaseditems",
            localField: "_id",
            foreignField: "ride",
            pipeline: [{ $match: { userId: userId } }],
            as: "purchasedInfo",
          },
        },
        {
          $addFields: {
            isPurchased: { $gt: [{ $size: "$purchasedInfo" }, 0] },
            isExpired: {
              $cond: [
                {
                  $gt: [
                    {
                      $size: {
                        $filter: {
                          input: "$purchasedInfo",
                          as: "item",
                          cond: {
                            $or: [{ $eq: ["$$item.expiryDate", null] }, { $gt: ["$$item.expiryDate", now] }],
                          },
                        },
                      },
                    },
                    0,
                  ],
                },
                false,
                true,
              ],
            },
            itemType: "ride",
          },
        },
        {
          $project: {
            name: 1,
            image: 1,
            coin: 1,
            type: 1,
            validity: 1,
            validityType: 1,
            svgaImage: 1,
            itemType: 1,
            isPurchased: 1,
            isExpired: 1,
            expiryDate: 1,
          },
        },
      ]),
    ]);

    const recommended = [...themes, ...frames, ...rides];

    return res.status(200).json({
      status: true,
      message: "Top frames and recommended items fetched successfully",
      topFrames,
      recommended,
    });
  } catch (error) {
    console.error("Error in getRecommendations:", error);
    return res.status(500).json({ status: false, message: "Internal server error" });
  }
};
