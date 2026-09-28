const Banner = require("../../models/banner.model");

//fetch Banners (filtered by bannerType)
exports.retrieveBannerList = async (req, res) => {
  try {
    const { bannerType } = req.query;

    const filter = {};
    if (bannerType && [1, 2, 3].includes(Number(bannerType))) {
      filter.bannerType = Number(bannerType);
    }
    filter.isActive = true;

    const banners = await Banner.find(filter).select("imageUrl redirectUrl bannerType").sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      status: true,
      message: "Banners retrieved successfully",
      data: banners,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};
