const WealthLevel = require("../../models/wealthLevel.model");

//get wealthLevel
exports.retrieveWealthHierarchy = async (req, res, next) => {
  try {
    const wealthLevels = await WealthLevel.find().sort({ level: 1 }).select("-createdAt -updatedAt -__v").lean();

    return res.status(200).json({
      status: true,
      message: "Retrieved wealth levels successfully.",
      data: wealthLevels,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
