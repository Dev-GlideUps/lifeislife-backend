const GameInfo = require("../../models/gameInfo.model");

//get active third party games
exports.fetchActiveThirdPartyGames = async (req, res) => {
  try {
    const setting = settingJSON ? settingJSON : null;
    if (!setting) {
      return res.status(200).json({ status: false, message: "Setting does not found." });
    }

    const isThirdPartyGameEnabled = setting.isThirdPartyGameEnabled === true;

    if (!isThirdPartyGameEnabled) {
      return res.status(200).json({
        status: true,
        message: "Third party games are disabled.",
        data: {
          isThirdPartyGameEnabled: false,
          games: [],
        },
      });
    }

    const games = await GameInfo.find({ isActive: { $ne: false } })
      .select("gameId name previewUrl gameVersion downloadUrl isActive")
      .sort({ gameId: 1 })
      .lean();

    return res.status(200).json({
      status: true,
      message: "Active third party games retrieved successfully.",
      data: {
        isThirdPartyGameEnabled: true,
        games,
      },
    });
  } catch (error) {
    console.error("Error in fetchActiveThirdPartyGames:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//get setting
exports.loadAppSettings = async (req, res) => {
  try {
    const setting = settingJSON ? settingJSON : null;
    if (!setting) {
      return res.status(200).json({ status: false, message: "Setting does not found." });
    }

    return res.status(200).json({ status: true, message: "Success", data: setting });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//get only profilePhotoList from settings
exports.getProfilePhotoList = async (req, res) => {
  try {
    const setting = settingJSON ? settingJSON : null;

    if (!setting) {
      return res.status(200).json({ status: false, message: "Settings not found." });
    }

    const responseData = {
      profilePhotoList: setting.profilePhotoList || [],
      fakeAudioCallAudioList: setting.fakeAudioCallAudioList || [],
      fakeVideoCallVideoList: setting.fakeVideoCallVideoList || [],
      privacyPolicyLink: setting.privacyPolicyLink || "",
      abouUpolicylink: setting.abouUpolicylink || "",
      termsOfUsePolicyLink: setting.termsOfUsePolicyLink || "",
    };

    return res.status(200).json({
      status: true,
      message: "Success",
      data: responseData,
    });
  } catch (error) {
    console.error("Error in getProfilePhotoList:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};
