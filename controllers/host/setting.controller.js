//get setting
exports.getSettingsData = async (req, res) => {
  try {
    const setting = settingJSON ? settingJSON : null;

    if (!setting) {
      return res.status(200).json({ status: false, message: "Setting not found." });
    }

    const filteredSetting = {
      currency: setting.currency,
    };

    return res.status(200).json({ status: true, message: "Success", data: filteredSetting });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};
