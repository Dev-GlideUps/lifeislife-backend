const AvtarFrame = require("../../models/avtarFrame.model");

//Get Avatar Frames
exports.listAvatarFrames = async (req, res) => {
  try {
    const avtarFrames = await AvtarFrame.find({ isActive: true, isDelete: false }).sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      status: true,
      message: "Retrieved Avatar Frames successfully.",
      data: avtarFrames,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
