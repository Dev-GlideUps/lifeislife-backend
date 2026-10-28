const BeautyEffect = require("../../models/beautyEffect.model");

// Get Beauty Effects
// Supports filtering by provider: ?provider=deepar or ?provider=tencent
exports.fetchBeautyEffects = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.start) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit) || 10, 1);
    const skip = (page - 1) * limit;

    const filter = {};
    filter.isActive = true;

    // Filter by provider if specified (deepar or tencent)
    const provider = req.query.provider?.trim()?.toLowerCase();
    if (provider && ["deepar", "tencent"].includes(provider)) {
      filter.provider = provider;
    }

    // Filter by effectType if specified
    const effectType = req.query.effectType?.trim()?.toLowerCase();
    if (effectType && ["filter", "sticker", "makeup", "segmentation", "beauty"].includes(effectType)) {
      filter.effectType = effectType;
    }

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
