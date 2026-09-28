const Theme = require("../../models/theme.model");

//fs
const fs = require("fs");

//deletefile
const { deleteFile } = require("../../util/deletefile");

//create theme
exports.createTheme = async (req, res, next) => {
  try {
    const { name, coin, validity, validityType } = req.body;
    const image = req.file ? req.file.path : "";

    const parsedValidityType = Number(validityType);

    if (!name || !coin || !validity || !validityType) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "Oops! Invalid details." });
    }

    if (![1, 2, 3].includes(parsedValidityType)) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "Invalid validity type. Choose 1 (Day), 2 (Month), or 3 (Year)." });
    }

    const theme = await new Theme({ name, image, coin, validity, validityType: parsedValidityType }).save();

    return res.status(201).json({
      status: true,
      message: "Theme has been created successfully.",
      data: theme,
    });
  } catch (error) {
    if (req.file) deleteFile(req.file);
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//update theme
exports.updateTheme = async (req, res, next) => {
  try {
    if (!req.query.themeId) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "themeId must be required." });
    }

    const theme = await Theme.findById(req.query.themeId);
    if (!theme) {
      if (req.file) deleteFile(req.file);
      return res.status(200).json({ status: false, message: "Theme not found." });
    }

    theme.name = req.body.name || theme.name;
    theme.coin = req.body.coin || theme.coin;
    theme.validity = req.body.validity || theme.validity;

    if (req.body.validityType) {
      const parsedValidityType = Number(req.body.validityType);
      if (![1, 2, 3].includes(parsedValidityType)) {
        return res.status(200).json({ status: false, message: "Invalid validity type. Choose 1 (Day), 2 (Month), or 3 (Year)." });
      }
      theme.validityType = parsedValidityType;
    }

    if (req.file) {
      if (theme.image) {
        deleteFile(theme?.image);
      }
      theme.image = req.file.path;
    }

    await theme.save();

    return res.status(200).json({
      status: true,
      message: "Theme has been updated successfully.",
      data: theme,
    });
  } catch (error) {
    if (req.file) deleteFile(req.file);
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//toggling the isActive status of a theme
exports.toggleThemeStatus = async (req, res, next) => {
  try {
    const { themeId } = req.query;

    if (!themeId) {
      return res.status(200).json({ status: false, message: "Theme ID is required." });
    }

    const theme = await Theme.findById(themeId);
    if (!theme) {
      return res.status(200).json({ status: false, message: "Theme not found." });
    }

    theme.isActive = !theme.isActive;
    await theme.save();

    return res.status(200).json({
      status: true,
      message: `Theme has been ${theme.isActive ? "activated" : "deactivated"} successfully.`,
      data: theme,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "An error occurred while updating theme status." });
  }
};

//toggling ride recommendation
exports.toggleThemeRecommendation = async (req, res, next) => {
  try {
    const { themeId } = req.query;

    if (!themeId) {
      return res.status(200).json({ status: false, message: "Theme ID is required." });
    }

    const theme = await Theme.findById(themeId);
    if (!theme) {
      return res.status(200).json({ status: false, message: "Theme not found." });
    }

    theme.isRecommended = !theme.isRecommended;
    await theme.save();

    return res.status(200).json({
      status: true,
      message: `Theme has been ${theme.isRecommended ? "recommended" : "not recommended"} successfully.`,
      data: theme,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: "An error occurred while updating theme recommendation status." });
  }
};

//get theme
exports.getThemes = async (req, res, next) => {
  try {
    const themes = await Theme.find({ isDelete: false }).sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      status: true,
      message: "Retrieved themes successfully.",
      data: themes,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//delete theme
exports.deleteTheme = async (req, res) => {
  try {
    const { themeId } = req.query;

    if (!themeId) {
      return res.status(200).json({ status: false, message: "themeId is required." });
    }

    const theme = await Theme.findById(themeId).select("_id image").lean();
    if (!theme) {
      return res.status(200).json({ status: false, message: "Theme not found." });
    }

    res.status(200).json({ status: true, message: "Theme has been deleted successfully." });

    // if (theme.image) {
    //   deleteFile(theme.image);
    // }

    await Promise.all([Theme.updateOne({ _id: themeId }, { $set: { isDelete: true } })]);
  } catch (error) {
    console.error("Error in deleteTheme:", error);
    return res.status(500).json({ status: false, message: "Internal Server Error." });
  }
};

//get themes dropdown
exports.fetchThemeDropdown = async (req, res) => {
  try {
    const search = req.query.search || "";

    const query = {
      isDelete: false,
      isActive: true,
    };

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const themes = await Theme.find(query).sort({ createdAt: -1 }).limit(50).lean();

    return res.status(200).json({
      status: true,
      message: "Retrieved Themes successfully.",
      data: themes,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
