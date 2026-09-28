const BeautyEffect = require("../../models/beautyEffect.model");

// Get Beauty Effects
exports.fetchBeautyEffects = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.start) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 10, 1);
    const skip = (page - 1) * limit;

    const filter = {};
    filter.isActive = true;

    const effects = await BeautyEffect.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();

    return res.status(200).json({
      status: true,
      message: "Beauty effects retrieved successfully.",
      data: effects,
    });
  } catch (error) {
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
