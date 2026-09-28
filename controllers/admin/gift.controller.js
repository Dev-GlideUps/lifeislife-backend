const Gift = require("../../models/gift.model");
const GiftCategory = require("../../models/giftCategory.model");
const History = require("../../models/history.model");

//deletefile
const { deleteFile, deleteFiles } = require("../../util/deletefile");

//create gift
exports.createGift = async (req, res, next) => {
  try {
    const { type, giftCategoryId, coin, title } = req.body;

    if (!type || !giftCategoryId || !title) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "Oops ! Invalid details." });
    }

    const [giftCategory] = await Promise.all([GiftCategory.findById(giftCategoryId).select("_id name")]);

    if (!giftCategory) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "GiftCategory does not exist." });
    }

    const giftData = {
      type,
      giftCategoryId,
      title: title.trim(),
      coin: coin || 0,
      image: req.files?.image ? req.files.image[0].path : "",
      svgaImage: type == 3 && req.files?.svgaImage ? req.files.svgaImage[0].path : "",
    };

    const gift = new Gift(giftData);
    await gift.save();

    return res.status(200).json({ status: true, message: "Gift has been created by the admin.", data: { ...gift.toObject(), giftCategory } });
  } catch (error) {
    if (req.files) deleteFiles(req.files);
    console.log(error);
    return res.status(200).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//update gift
exports.updateGift = async (req, res, next) => {
  try {
    const { giftId, giftCategoryId } = req.body;

    if (!giftId) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "giftId must be required." });
    }

    const [gift, giftCategory] = await Promise.all([Gift.findById(giftId), giftCategoryId ? GiftCategory.findById(giftCategoryId).select("_id name") : null]);

    if (!gift) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "gift does not found." });
    }

    if (giftCategoryId && !giftCategory) {
      if (req.files) deleteFiles(req.files);
      return res.status(200).json({ status: false, message: "GiftCategory does not found." });
    }

    gift.type = req.body.type ? req.body.type : gift.type;
    gift.title = req.body.title ? req.body.title.trim() : gift.title;
    gift.coin = req.body.coin ? req.body.coin : gift.coin;
    gift.giftCategoryId = req.body.giftCategoryId ? req.body.giftCategoryId : gift.giftCategoryId;

    if (req.files.image) {
      if (gift.image) {
        deleteFile(gift.image);
      }

      gift.image = req.files.image ? req.files.image[0].path : gift.image;
    }

    if (req.body.type == 3 && req.files.svgaImage) {
      if (gift.svgaImage) {
        deleteFile(gift.svgaImage);
      }

      gift.svgaImage = req.files.svgaImage ? req.files.svgaImage[0].path : gift.svgaImage;
    }

    await gift.save();

    return res.status(200).json({ status: true, message: "Gift has been updated by the admin.", data: { ...gift.toObject(), giftCategory } });
  } catch (error) {
    if (req.files) deleteFiles(req.files);
    console.log(error);
    return res.status(200).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//get gifts
exports.getGifts = async (req, res, next) => {
  try {
    const [giftCategories, totalGifts, giftStats] = await Promise.all([
      Gift.aggregate([
        { $match: { isDelete: false } },
        {
          $lookup: {
            from: "giftcategories",
            localField: "giftCategoryId",
            foreignField: "_id",
            as: "category",
          },
        },
        {
          $unwind: {
            path: "$category",
            preserveNullAndEmptyArrays: false,
          },
        },
        {
          $group: {
            _id: "$giftCategoryId",
            categoryName: { $first: "$category.name" },
            gifts: {
              $push: {
                _id: "$_id",
                type: "$type",
                title: "$title",
                image: "$image",
                svgaImage: "$svgaImage",
                coin: "$coin",
                createdAt: "$createdAt",
              },
            },
          },
        },
        { $sort: { "gifts.createdAt": -1 } },
      ]),
      Gift.countDocuments({ isDelete: false }),
      History.aggregate([
        {
          $match: {
            type: { $in: [6, 25] },
            giftId: { $ne: null },
            giftReceivedCount: { $gt: 0 },
          },
        },
        {
          $group: {
            _id: null,
            totalGiftsSent: { $sum: "$giftReceivedCount" },
            giftRevenue: { $sum: { $multiply: ["$giftCoin", "$giftReceivedCount"] } },
          },
        },
        { $project: { _id: 0, totalGiftsSent: 1, giftRevenue: 1 } },
      ]),
    ]);

    const giftStatsRow = giftStats?.[0] || {};
    const totalGiftsSent = giftStatsRow?.totalGiftsSent || 0;
    const giftRevenue = giftStatsRow?.giftRevenue || 0;
    const avgGiftValue = totalGiftsSent > 0 ? giftRevenue / totalGiftsSent : 0;

    const summary = {
      totalGifts: totalGifts || 0,
      totalGiftsSent,
      giftRevenue,
      avgGiftValue,
    };

    return res.status(200).json({
      status: true,
      message: "Retrive gifts for the admin.",
      summary,
      data: giftCategories || [],
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//delete gift
exports.deleteGift = async (req, res, next) => {
  try {
    const { giftId } = req.query;

    if (!giftId) {
      return res.status(200).json({ status: false, message: "giftId must be required." });
    }

    const gift = await Gift.findById(giftId).select("_id").lean();
    if (!gift) {
      return res.status(200).json({ status: false, message: "Gift does not exist." });
    }

    res.status(200).json({ status: true, message: "Gift has been marked as deleted by the admin." });

    //await Gift.findByIdAndUpdate(giftId, { isDelete: true });
    await Gift.findByIdAndDelete(giftId);
  } catch (error) {
    return res.status(200).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//gift analytics (most popular + revenue by gift)
exports.fetchGiftAnalytics = async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 6;

    const matchGiftHistory = {
      type: { $in: [6, 25] },
      giftId: { $ne: null },
      giftReceivedCount: { $gt: 0 },
    };

    const giftLookupAndProject = [
      {
        $lookup: {
          from: "gifts",
          localField: "_id",
          foreignField: "_id",
          pipeline: [{ $project: { title: 1, image: 1, svgaImage: 1, coin: 1 } }],
          as: "gift",
        },
      },
      { $unwind: { path: "$gift", preserveNullAndEmptyArrays: false } },
      {
        $project: {
          _id: 0,
          giftId: "$_id",
          title: { $ifNull: ["$gift.title", ""] },
          image: { $ifNull: ["$gift.image", ""] },
          svgaImage: { $ifNull: ["$gift.svgaImage", ""] },
          coin: { $ifNull: ["$gift.coin", 0] },
          sent: 1,
          revenue: 1,
        },
      },
    ];

    const [popularRows, revenueRows] = await Promise.all([
      History.aggregate([
        { $match: matchGiftHistory },
        {
          $group: {
            _id: "$giftId",
            sent: { $sum: "$giftReceivedCount" },
            revenue: { $sum: { $multiply: ["$giftCoin", "$giftReceivedCount"] } },
          },
        },
        { $sort: { sent: -1 } },
        { $limit: limit },
        ...giftLookupAndProject,
      ]),
      History.aggregate([
        { $match: matchGiftHistory },
        {
          $group: {
            _id: "$giftId",
            sent: { $sum: "$giftReceivedCount" },
            revenue: { $sum: { $multiply: ["$giftCoin", "$giftReceivedCount"] } },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: limit },
        ...giftLookupAndProject,
      ]),
    ]);

    const mostPopularGifts = popularRows || [];
    const revenueByGift = revenueRows || [];

    return res.status(200).json({
      status: true,
      message: "Gift analytics fetched successfully.",
      mostPopularGifts,
      revenueByGift,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
