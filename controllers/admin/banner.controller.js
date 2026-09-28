const Banner = require("../../models/banner.model");

//deletefile
const { deleteFile } = require("../../util/deletefile");

//fs
const fs = require("fs");

//create Banner
exports.createNewBanner = async (req, res) => {
  try {
    const { redirectUrl = "", bannerType } = req.body;

    if (!req.file || !bannerType) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "Oops! imageUrl and bannerType are required." });
    }

    if (![1, 2, 3, 4].includes(Number(bannerType))) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "Invalid bannerType value." });
    }

    const banner = new Banner({
      imageUrl: req.file ? req.file.path : "",
      redirectUrl: redirectUrl ? redirectUrl.trim() : "",
      bannerType,
    });

    await banner.save();

    return res.status(200).json({
      status: true,
      message: "Banner created successfully",
      data: banner,
    });
  } catch (error) {
    if (req.file) deleteFile(req.file);
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server error" });
  }
};

//update Banner
exports.modifyBannerDetails = async (req, res) => {
  try {
    const { bannerId } = req.body;
    if (!bannerId) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "bannerId is required." });
    }

    const banner = await Banner.findById(bannerId).lean();
    if (!banner) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "Banner not found." });
    }

    if (req.file && banner.imageUrl) {
      deleteFile(banner.imageUrl);
    }

    const updateFields = {
      imageUrl: req.file ? req.file.path : banner.imageUrl,
      redirectUrl: req.body.redirectUrl !== undefined ? req.body.redirectUrl.trim() : banner.redirectUrl,
      bannerType: req.body.bannerType ? req.body.bannerType : banner.bannerType,
    };

    const updatedBanner = await Banner.findByIdAndUpdate(bannerId, updateFields, {
      new: true,
      select: "imageUrl redirectUrl bannerType isActive createdAt updatedAt",
      lean: true,
    });

    return res.status(200).json({
      status: true,
      message: "Banner updated successfully",
      data: updatedBanner,
    });
  } catch (error) {
    if (req.file) deleteFile(req.file);
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//toggle Banner Active Status
exports.toggleBannerActiveState = async (req, res) => {
  try {
    const { bannerId } = req.query;

    if (!bannerId) {
      return res.status(200).json({ status: false, message: "bannerId is required." });
    }

    const banner = await Banner.findById(bannerId).select("isActive").lean();

    if (!banner) {
      return res.status(200).json({ status: false, message: "Banner not found." });
    }

    const updatedBanner = await Banner.findByIdAndUpdate(bannerId, { isActive: !banner.isActive }, { new: true, select: "isActive" }).lean();

    return res.status(200).json({ status: true, message: "Banner status updated successfully", data: updatedBanner });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//remove Banner
exports.removeBanner = async (req, res) => {
  try {
    const { bannerId } = req.query;

    if (!bannerId) {
      return res.status(200).json({ status: false, message: "bannerId is required." });
    }

    const banner = await Banner.findById(bannerId).select("_id").lean();

    if (!banner) {
      return res.status(200).json({ status: false, message: "Banner not found." });
    }

    res.status(200).json({
      status: true,
      message: "Banner deleted successfully",
    });

    if (banner.imageUrl) {
      deleteFile(banner.imageUrl);
    }

    await Banner.deleteOne({ _id: bannerId });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server error" });
  }
};

//fetch Banners (filtered by bannerType)
exports.fetchBannerList = async (req, res) => {
  try {
    const { bannerType } = req.query;
    if (![1, 2, 3, 4].includes(Number(bannerType))) {
      return res.status(200).json({ status: false, message: "Invalid bannerType value." });
    }

    const filter = {};
    if (bannerType && [1, 2, 3, 4].includes(Number(bannerType))) {
      filter.bannerType = Number(bannerType);
    }

    const banners = await Banner.find(filter).select("imageUrl redirectUrl bannerType isActive createdAt updatedAt").sort({ createdAt: -1 }).lean();

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
