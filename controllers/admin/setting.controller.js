const Setting = require("../../models/setting.model");
const { deleteFile } = require("../../util/deletefile");

const fs = require("fs");
const path = require("path");

const Joi = require("joi");

const sha256Regex = /^([A-F0-9]{2}:){31}[A-F0-9]{2}$/;
const androidAssetLinksSchema = Joi.array()
  .min(1)
  .max(5)
  .items(
    Joi.object({
      relation: Joi.array().items(Joi.string().valid("delegate_permission/common.handle_all_urls")).min(1).required(),

      target: Joi.object({
        namespace: Joi.string().valid("android_app").required(),

        package_name: Joi.string()
          .pattern(/^[a-zA-Z0-9_.]+$/)
          .required(),

        sha256_cert_fingerprints: Joi.array().min(1).max(10).items(Joi.string().uppercase().pattern(sha256Regex).required()).required(),
      })
        .required()
        .unknown(false),
    })
      .required()
      .unknown(false),
  )
  .required();

const appleAppSiteAssociationSchema = Joi.object({
  applinks: Joi.object({
    apps: Joi.array().items(Joi.string()).required(),
    details: Joi.array()
      .items(
        Joi.object({
          appID: Joi.string().required(),
          paths: Joi.array().items(Joi.string()).required(),
        }),
      )
      .min(1)
      .required(),
  }).required(),
}).unknown(true);

//update setting
exports.modifySetting = async (req, res) => {
  try {
    if (!req.query.settingId) {
      return res.status(200).json({ status: false, message: "SettingId mumst be requried." });
    }

    const setting = await Setting.findById(req.query.settingId);
    if (!setting) {
      return res.status(200).json({ status: false, message: "Setting does not found." });
    }

    setting.agoraAppId = req.body.agoraAppId ? req.body.agoraAppId.trim() : setting.agoraAppId;
    setting.agoraAppCertificate = req.body.agoraAppCertificate ? req.body.agoraAppCertificate.trim() : setting.agoraAppCertificate;

    setting.zegoAppId = req.body.zegoAppId ? req.body.zegoAppId.trim() : setting.zegoAppId;
    setting.zegoAppSign = req.body.zegoAppSign ? req.body.zegoAppSign.trim() : setting.zegoAppSign;
    setting.zegoServerSecret = req.body.zegoServerSecret ? req.body.zegoServerSecret.trim() : setting.zegoServerSecret;

    setting.sightengineUser = req.body.sightengineUser ? req.body.sightengineUser : setting.sightengineUser;
    setting.sightengineApiSecret = req.body.sightengineApiSecret ? req.body.sightengineApiSecret : setting.sightengineApiSecret;

    setting.androidEffectLicenseKey = req.body.androidEffectLicenseKey ? req.body.androidEffectLicenseKey : setting.androidEffectLicenseKey;
    setting.iosEffectLicenseKey = req.body.iosEffectLicenseKey ? req.body.iosEffectLicenseKey : setting.iosEffectLicenseKey;
    setting.videoBanned = req.body.videoBanned ? req.body.videoBanned.toString().split(",") : setting.videoBanned;
    setting.postBanned = req.body.postBanned ? req.body.postBanned.toString().split(",") : setting.postBanned;

    setting.resendApiKey = req.body.resendApiKey ? req.body.resendApiKey : setting?.resendApiKey;

    setting.baishunTestServer = req.body.baishunTestServer ? req.body.baishunTestServer.trim() : setting.baishunTestServer;
    setting.baishunProdServer = req.body.baishunProdServer ? req.body.baishunProdServer.trim() : setting.baishunProdServer;
    setting.baishunAppKey = req.body.baishunAppKey ? req.body.baishunAppKey : setting.baishunAppKey;
    setting.baishunAppChannel = req.body.baishunAppChannel ? req.body.baishunAppChannel : setting.baishunAppChannel;
    setting.baishunAppId = parseInt(req.body.baishunAppId) ? parseInt(req.body.baishunAppId) : setting.baishunAppId;

    setting.privacyPolicyLink = req.body.privacyPolicyLink ? req.body.privacyPolicyLink : setting.privacyPolicyLink;
    setting.termsOfUsePolicyLink = req.body.termsOfUsePolicyLink ? req.body.termsOfUsePolicyLink : setting.termsOfUsePolicyLink;
    setting.abouUpolicylink = req.body.abouUpolicylink ? req.body.abouUpolicylink : setting?.abouUpolicylink;

    setting.googlePlayServiceAccountEmail = req.body.googlePlayServiceAccountEmail ? req.body.googlePlayServiceAccountEmail?.trim() : setting.googlePlayServiceAccountEmail;
    if (req.body.googlePlayPrivateKey) {
      setting.googlePlayPrivateKey = typeof req.body.googlePlayPrivateKey === "string" ? JSON.parse(req.body.googlePlayPrivateKey.trim()) : req.body.googlePlayPrivateKey;
    }

    setting.cashfreeClientId = req.body.cashfreeClientId ? req.body.cashfreeClientId : setting?.cashfreeClientId;
    setting.cashfreeClientSecret = req.body.cashfreeClientSecret ? req.body.cashfreeClientSecret : setting?.cashfreeClientSecret;

    setting.paypalClientId = req.body.paypalClientId ? req.body.paypalClientId : setting?.paypalClientId;
    setting.paypalSecret = req.body.paypalSecret ? req.body.paypalSecret : setting?.paypalSecret;

    setting.paystackSecretKey = req.body.paystackSecretKey ? req.body.paystackSecretKey : setting?.paystackSecretKey;

    setting.stripePublishableKey = req.body.stripePublishableKey ? req.body.stripePublishableKey : setting.stripePublishableKey;
    setting.stripeSecretKey = req.body.stripeSecretKey ? req.body.stripeSecretKey : setting.stripeSecretKey;

    setting.razorPayId = req.body.razorPayId ? req.body.razorPayId : setting.razorPayId;
    setting.razorSecretKey = req.body.razorSecretKey ? req.body.razorSecretKey : setting.razorSecretKey;

    setting.flutterWaveId = req.body.flutterWaveId ? req.body.flutterWaveId : setting.flutterWaveId;

    setting.nowPaymentsApiKey = req.body.nowPaymentsApiKey ? req.body.nowPaymentsApiKey : setting?.nowPaymentsApiKey;
    setting.nowPaymentsIpnSecret = req.body.nowPaymentsIpnSecret ? req.body.nowPaymentsIpnSecret : setting?.nowPaymentsIpnSecret;
    setting.nowPaymentsBaseUrl = req.body.nowPaymentsBaseUrl ? req.body.nowPaymentsBaseUrl : setting?.nowPaymentsBaseUrl;

    setting.durationOfShorts = parseInt(req.body.durationOfShorts) ? parseInt(req.body.durationOfShorts) : setting.durationOfShorts;
    setting.loginBonus = parseInt(req.body.loginBonus) ? parseInt(req.body.loginBonus) : setting.loginBonus;

    setting.coinGameThreshold = parseInt(req.body.coinGameThreshold) ? parseInt(req.body.coinGameThreshold) : setting.coinGameThreshold;
    setting.coinBroadcastThreshold = parseInt(req.body.coinBroadcastThreshold) ? parseInt(req.body.coinBroadcastThreshold) : setting.coinBroadcastThreshold;

    setting.pkEndTime = parseInt(req.body.pkEndTime) ? parseInt(req.body.pkEndTime) : setting.pkEndTime;

    if (req.body.adminRate !== undefined) {
      const rawAdminRate = req.body.adminRate;
      const adminRate = typeof rawAdminRate === "string" && String(rawAdminRate).trim() === "" ? NaN : parseInt(rawAdminRate, 10);
      if (Number.isNaN(adminRate) || adminRate < 0) {
        return res.status(200).json({
          status: false,
          message: "adminRate must be a valid number; 0 is allowed.",
        });
      }
      if (adminRate > 100) {
        return res.status(200).json({
          status: false,
          message: "adminRate cannot be greater than 100.",
        });
      }
      setting.adminRate = adminRate;
    }

    const rawAgencyRate = req.body.agencyRate !== undefined ? req.body.agencyRate : req.body.agencyrate;
    if (rawAgencyRate !== undefined) {
      const agencyRate = typeof rawAgencyRate === "string" && String(rawAgencyRate).trim() === "" ? NaN : parseInt(rawAgencyRate, 10);
      if (Number.isNaN(agencyRate) || agencyRate < 0) {
        return res.status(200).json({
          status: false,
          message: "agencyRate (or agencyrate) must be a valid number; 0 is allowed.",
        });
      }
      if (agencyRate > 100) {
        return res.status(200).json({
          status: false,
          message: "agencyRate cannot be greater than 100.",
        });
      }
      setting.agencyRate = agencyRate;
    }

    setting.privateCallRate = parseInt(req.body.privateCallRate) ? parseInt(req.body.privateCallRate) : setting.privateCallRate;
    setting.privateAudioCallRate = parseInt(req.body.privateAudioCallRate) ? parseInt(req.body.privateAudioCallRate) : setting.privateAudioCallRate;

    setting.luckyGiftAdminTaxPercent = parseInt(req.body.luckyGiftAdminTaxPercent) ? parseInt(req.body.luckyGiftAdminTaxPercent) : setting.luckyGiftAdminTaxPercent;
    setting.luckyGiftReceiverSharePercent = parseInt(req.body.luckyGiftReceiverSharePercent) ? parseInt(req.body.luckyGiftReceiverSharePercent) : setting.luckyGiftReceiverSharePercent;

    setting.minCoinsToCashOut = parseInt(req.body.minCoinsToCashOut) ? parseInt(req.body.minCoinsToCashOut) : setting.minCoinsToCashOut;
    setting.minCoinsForPayout = req.body.minCoinsForPayout ? parseInt(req.body.minCoinsForPayout) : setting.minCoinsForPayout;
    setting.agencyMinPayout = req.body.agencyMinPayout ? parseInt(req.body.agencyMinPayout) : setting.agencyMinPayout;

    if (req.body.privateKey) {
      setting.privateKey = typeof req.body.privateKey === "string" ? JSON.parse(req.body.privateKey.trim()) : req.body.privateKey;
    }

    if (req.body.androidAssetLinks !== undefined) {
      let parsedAndroidAssetLinks = req.body.androidAssetLinks;

      if (typeof parsedAndroidAssetLinks === "string") {
        try {
          parsedAndroidAssetLinks = JSON.parse(parsedAndroidAssetLinks.trim());
        } catch (err) {
          return res.status(200).json({
            status: false,
            message: "androidAssetLinks must be valid JSON",
          });
        }
      }

      const { error, value } = androidAssetLinksSchema.validate(parsedAndroidAssetLinks, {
        abortEarly: true,
      });

      if (error) {
        return res.status(200).json({
          status: false,
          message: error.details[0].message,
        });
      }

      setting.androidAssetLinks = Object.freeze(value);
    }

    if (req.body.appleAppSiteAssociation !== undefined) {
      let parsedAppleAASA = req.body.appleAppSiteAssociation;

      if (typeof parsedAppleAASA === "string") {
        try {
          parsedAppleAASA = JSON.parse(parsedAppleAASA.trim());
        } catch (err) {
          return res.status(200).json({
            status: false,
            message: "appleAppSiteAssociation must be valid JSON",
          });
        }
      }

      const { error, value } = appleAppSiteAssociationSchema.validate(parsedAppleAASA, {
        abortEarly: true,
      });

      if (error) {
        return res.status(200).json({
          status: false,
          message: error.details[0].message,
        });
      }

      setting.appleAppSiteAssociation = Object.freeze(value);
    }

    await setting.save();

    res.status(200).json({
      status: true,
      message: "Setting has been Updated.",
      data: setting,
    });

    updateSettingFile(setting);

    if (req.body.privateKey) {
      try {
        setTimeout(() => {
          console.log("Restarting server after privateKey update...");
          process.exit(0);
        }, 500); // 0.5s delay
        return;
      } catch (err) {
        console.error("Failed to update privateKey:", err);
      }
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//get setting
exports.fetchSetting = async (req, res) => {
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

//update setting switch
exports.modifySettingToggle = async (req, res) => {
  try {
    if (!req.query.settingId || !req.query.type) {
      return res.status(200).json({ status: false, message: "Oops ! Invalid details!" });
    }

    const setting = await Setting.findById(req.query.settingId);
    if (!setting) {
      return res.status(200).json({ status: false, message: "Setting does not found." });
    }

    if (req.query.type === "shortsEffectEnabled") {
      setting.shortsEffectEnabled = !setting.shortsEffectEnabled;
    } else if (req.query.type === "isDummyData") {
      setting.isDummyData = !setting.isDummyData;
    } else if (req.query.type === "isStripeEnabled") {
      setting.isStripeEnabled = !setting.isStripeEnabled;
    } else if (req.query.type === "isRazorpayEnabled") {
      setting.isRazorpayEnabled = !setting.isRazorpayEnabled;
    } else if (req.query.type === "isGooglePlayEnabled") {
      setting.isGooglePlayEnabled = !setting.isGooglePlayEnabled;
    } else if (req.query.type === "isFlutterwaveEnabled") {
      setting.isFlutterwaveEnabled = !setting.isFlutterwaveEnabled;
    } else if (req.query.type === "watermarkEnabled") {
      setting.watermarkEnabled = !setting.watermarkEnabled;
    } else if (req.query.type === "isPaypalEnabled") {
      setting.isPaypalEnabled = !setting.isPaypalEnabled;
    } else if (req.query.type === "isPaystackEnabled") {
      setting.isPaystackEnabled = !setting.isPaystackEnabled;
    } else if (req.query.type === "isCashfreeEnabled") {
      setting.isCashfreeEnabled = !setting.isCashfreeEnabled;
    } else if (req.query.type === "isNowPaymentsEnabled") {
      setting.isNowPaymentsEnabled = !setting.isNowPaymentsEnabled;
    } else if (req.query.type === "isAgoraEnabled") {
      setting.isAgoraEnabled = !setting.isAgoraEnabled;
    } else if (req.query.type === "isZegoEnabled") {
      setting.isZegoEnabled = !setting.isZegoEnabled;
    } else if (req.query.type === "isThirdPartyGameEnabled") {
      setting.isThirdPartyGameEnabled = !setting.isThirdPartyGameEnabled;
    } else {
      return res.status(200).json({ status: false, message: "type passed must be valid." });
    }

    await setting.save();

    res.status(200).json({ status: true, message: "Success", data: setting });

    updateSettingFile(setting);
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//manage user profile image list
exports.updateProfilePhotoList = async (req, res) => {
  try {
    const { settingId, action, index } = req.body;

    if (!settingId) {
      return res.status(200).json({ status: false, message: "SettingId must be provided." });
    }

    const setting = await Setting.findById(settingId);
    if (!setting) {
      return res.status(200).json({ status: false, message: "Setting not found." });
    }

    if (action === "add") {
      if (!req.files || req.files.length === 0) {
        return res.status(200).json({ status: false, message: "Files must be uploaded to add." });
      }

      req.files.forEach((file) => {
        const filePath = `storage/defaultphoto/${file.filename}`;
        setting.profilePhotoList.push(filePath);
      });
    } else if (action === "remove") {
      if (typeof index === "undefined" || index < 0 || index >= setting.profilePhotoList.length) {
        return res.status(200).json({ status: false, message: "Valid index must be provided to remove." });
      }

      const fileToDelete = setting.profilePhotoList[index];
      const filePath = path.join(process.cwd(), fileToDelete);

      setting.profilePhotoList.splice(index, 1);

      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath); // Delete file
          if (!fs.existsSync(filePath)) {
            console.log(`✅ File successfully deleted: ${filePath}`);
          } else {
            console.warn(`⚠️ File deletion failed (still exists): ${filePath}`);
          }
        } catch (err) {
          console.error(`❌ Error deleting file: ${filePath}`, err);
        }
      } else {
        console.warn(`⚠️ File not found for deletion: ${filePath}`);
      }
    } else {
      return res.status(200).json({ status: false, message: "Invalid action. Use 'add' or 'remove'." });
    }

    await setting.save();

    res.status(200).json({
      status: true,
      message: `Profile photo ${action === "add" ? "added" : "removed"} successfully.`,
      data: setting.profilePhotoList,
    });

    updateSettingFile(setting);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//fake audio call audios
exports.updateFakeAudioCallAudioList = async (req, res) => {
  try {
    const { settingId, action, index } = req.body;

    if (!settingId) {
      return res.status(200).json({ status: false, message: "SettingId must be provided." });
    }

    const setting = await Setting.findById(settingId);
    if (!setting) {
      return res.status(200).json({ status: false, message: "Setting not found." });
    }

    if (action === "add") {
      if (!req.files || req.files.length === 0) {
        return res.status(200).json({ status: false, message: "Files must be uploaded to add." });
      }

      req.files.forEach((file) => {
        const filePath = `storage/fakeAudioCallAudio/${file.filename}`;
        setting.fakeAudioCallAudioList.push(filePath);
      });
    } else if (action === "remove") {
      if (typeof index === "undefined" || index < 0 || index >= setting.fakeAudioCallAudioList.length) {
        return res.status(200).json({ status: false, message: "Valid index must be provided to remove." });
      }

      const fileToDelete = setting.fakeAudioCallAudioList[index];
      const filePath = path.join(process.cwd(), fileToDelete);

      setting.fakeAudioCallAudioList.splice(index, 1);

      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.error(`❌ Error deleting file: ${filePath}`, err);
        }
      }
    } else {
      return res.status(200).json({ status: false, message: "Invalid action. Use 'add' or 'remove'." });
    }

    await setting.save();

    res.status(200).json({
      status: true,
      message: `Fake audio call audio ${action === "add" ? "added" : "removed"} successfully.`,
      data: setting.fakeAudioCallAudioList,
    });

    updateSettingFile(setting);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//fake video call videos
exports.updateFakeVideoCallVideoList = async (req, res) => {
  try {
    const { settingId, action, index } = req.body;

    if (!settingId) {
      return res.status(200).json({ status: false, message: "SettingId must be provided." });
    }

    const setting = await Setting.findById(settingId);
    if (!setting) {
      return res.status(200).json({ status: false, message: "Setting not found." });
    }

    if (action === "add") {
      if (!req.files || req.files.length === 0) {
        return res.status(200).json({ status: false, message: "Files must be uploaded to add." });
      }

      req.files.forEach((file) => {
        const filePath = `storage/fakeVideoCallVideo/${file.filename}`;
        setting.fakeVideoCallVideoList.push(filePath);
      });
    } else if (action === "remove") {
      if (typeof index === "undefined" || index < 0 || index >= setting.fakeVideoCallVideoList.length) {
        return res.status(200).json({ status: false, message: "Valid index must be provided to remove." });
      }

      const fileToDelete = setting.fakeVideoCallVideoList[index];
      const filePath = path.join(process.cwd(), fileToDelete);

      setting.fakeVideoCallVideoList.splice(index, 1);

      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.error(`❌ Error deleting file: ${filePath}`, err);
        }
      }
    } else {
      return res.status(200).json({ status: false, message: "Invalid action. Use 'add' or 'remove'." });
    }

    await setting.save();

    res.status(200).json({
      status: true,
      message: `Fake video call video ${action === "add" ? "added" : "removed"} successfully.`,
      data: setting.fakeVideoCallVideoList,
    });

    updateSettingFile(setting);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//create game
exports.addGame = async (req, res) => {
  try {
    const [setting] = await Promise.all([Setting.findById(req.query.settingId).select("game").lean()]);

    if (!setting) {
      return res.status(200).json({ status: false, message: "Setting not found!" });
    }

    const { name, link, minWinPercent, maxWinPercent } = req.body;
    if (!name || !link || !minWinPercent || !maxWinPercent || !req.file) {
      return res.status(200).json({ status: false, message: "Incomplete game details provided!" });
    }

    if (setting.game) {
      const gameAlreadyExists = setting.game.some((game) => game.name.toLowerCase() === name.toLowerCase());

      if (gameAlreadyExists) {
        return res.status(200).json({ status: false, message: "Game with this name already exists!" });
      }
    }

    const updatedSetting = await Setting.findOneAndUpdate(
      { _id: req.query.settingId },
      {
        $push: {
          game: {
            name,
            image: req.file.path,
            link,
            minWinPercent,
            maxWinPercent,
          },
        },
      },
      { new: true, lean: true },
    );

    if (!updatedSetting) {
      return res.status(200).json({ status: false, message: "Failed to update setting!" });
    }

    res.status(200).json({ status: true, message: "Game added successfully!", setting: updatedSetting });

    updateSettingFile(updatedSetting);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//edit game
exports.modifyGame = async (req, res) => {
  try {
    const { settingId } = req.query;
    const { gameId, name, link, minWinPercent, maxWinPercent } = req.body;

    if (!settingId) {
      return res.status(200).json({ status: false, message: "Setting ID is required!" });
    }

    if (!gameId) {
      return res.status(200).json({ status: false, message: "Game ID is required!" });
    }

    const setting = await Setting.findOne({ _id: settingId, "game._id": gameId }).select("game").lean();
    if (!setting) {
      return res.status(200).json({ status: false, message: "Setting or Game not found!" });
    }

    const existingGame = setting.game.find((g) => g._id.toString() === gameId);
    if (!existingGame) {
      return res.status(200).json({ status: false, message: "Game not found in setting!" });
    }

    const updateFields = {};
    if (name) updateFields["game.$.name"] = name;
    if (link) updateFields["game.$.link"] = link;
    if (minWinPercent !== undefined) updateFields["game.$.minWinPercent"] = minWinPercent;
    if (maxWinPercent !== undefined) updateFields["game.$.maxWinPercent"] = maxWinPercent;

    if (req.file) {
      if (existingGame.image) {
        deleteFile(existingGame.image);
      }

      updateFields["game.$.image"] = req.file.path;
    }

    const updatedSetting = await Setting.findOneAndUpdate({ _id: settingId, "game._id": gameId }, { $set: updateFields }, { new: true, lean: true });

    if (!updatedSetting) {
      return res.status(200).json({ status: false, message: "Setting or Game not found!" });
    }

    res.status(200).json({ status: true, message: "Game updated successfully!", setting: updatedSetting });

    updateSettingFile(updatedSetting);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//game status handle
exports.toggleGameStatus = async (req, res) => {
  try {
    const { settingId, gameId } = req.query;

    if (!settingId) {
      return res.status(200).json({ status: false, message: "Setting ID is required!" });
    }

    if (!gameId) {
      return res.status(200).json({ status: false, message: "Game ID is required!" });
    }

    const setting = await Setting.findOne({ _id: settingId, "game._id": gameId }).select("game").lean();
    if (!setting) {
      return res.status(200).json({ status: false, message: "Setting or Game not found!" });
    }

    const existingGame = setting.game.find((g) => g._id.toString() === gameId);
    if (!existingGame) {
      return res.status(200).json({ status: false, message: "Game not found in setting!" });
    }

    const newStatus = !existingGame.isActive;

    const updatedSetting = await Setting.findOneAndUpdate({ _id: settingId, "game._id": gameId }, { $set: { "game.$.isActive": newStatus } }, { new: true, lean: true });

    if (!updatedSetting) {
      return res.status(200).json({ status: false, message: "Failed to update game status!" });
    }

    const message = newStatus ? "Game activated successfully!" : "Game deactivated successfully!";

    res.status(200).json({ status: true, message, setting: updatedSetting });

    updateSettingFile(updatedSetting);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//remove game
exports.removeGame = async (req, res) => {
  try {
    const { settingId, gameId } = req.query;

    if (!settingId) {
      return res.status(200).json({ status: false, message: "Setting ID is required!" });
    }

    if (!gameId) {
      return res.status(200).json({ status: false, message: "Game ID is required!" });
    }

    const setting = await Setting.findOne({ _id: settingId, "game._id": gameId }).select("game").lean();
    if (!setting) {
      return res.status(200).json({ status: false, message: "Setting or Game not found!" });
    }

    const existingGame = setting.game.find((g) => g._id.toString() === gameId);
    if (!existingGame) {
      return res.status(200).json({ status: false, message: "Game not found in setting!" });
    }

    if (existingGame.image) {
      deleteFile(existingGame.image);
    }

    const updatedSetting = await Setting.findOneAndUpdate({ _id: settingId }, { $pull: { game: { _id: gameId } } }, { new: true, lean: true });

    if (!updatedSetting) {
      return res.status(200).json({ status: false, message: "Setting not found!" });
    }

    res.status(200).json({ status: true, message: "Game deleted successfully!", setting: updatedSetting });

    updateSettingFile(updatedSetting);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//update game coin
exports.modifyGameCoin = async (req, res) => {
  try {
    const { settingId, gameCoin } = req.body;

    if (!settingId) {
      return res.status(200).json({ status: false, message: "Setting ID is required." });
    }

    if (!Array.isArray(gameCoin) || gameCoin.some((coin) => typeof coin !== "number")) {
      return res.status(200).json({ status: false, message: "gameCoin must be an array of numbers." });
    }

    const setting = await Setting.findById(settingId);
    if (!setting) {
      return res.status(200).json({ status: false, message: "Setting not found." });
    }

    res.status(200).json({
      status: true,
      message: "Game coins updated successfully.",
      data: gameCoin,
    });

    setting.gameCoin = gameCoin;
    await setting.save();
    updateSettingFile(setting);
  } catch (error) {
    console.error("Error updating gameCoin:", error);
    return res.status(500).json({ status: false, message: "Internal Server Error", error: error.message });
  }
};

//get game setting
exports.retrieveGameSettings = async (req, res) => {
  try {
    const setting = settingJSON ? settingJSON : null;

    if (!setting) {
      return res.status(200).json({ status: false, message: "Setting not found." });
    }

    const filteredSetting = {
      gameCoin: setting.gameCoin,
    };

    return res.status(200).json({ status: true, message: "Success", data: filteredSetting });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//get lucky gift pool (luckyGiftTargetCoin only)
exports.getLuckyGiftTargetCoin = async (req, res) => {
  try {
    const setting = settingJSON ? settingJSON : null;
    if (!setting) {
      return res.status(200).json({ status: false, message: "Setting not found." });
    }

    const filteredSetting = {
      luckyGiftTargetCoin: setting.luckyGiftTargetCoin,
    };

    return res.status(200).json({
      status: true,
      message: "Success",
      data: filteredSetting,
    });
  } catch (error) {
    console.error("fetchLuckyGiftTargetCoin error:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//reset lucky gift pool (luckyGiftTargetCoin → 0)
exports.resetLuckyGiftTargetCoin = async (req, res) => {
  try {
    const existing = await Setting.findOne().select("luckyGiftTargetCoin").lean();
    if (!existing) {
      return res.status(200).json({ status: false, message: "Setting not found." });
    }

    const previousLuckyGiftTargetCoin = existing.luckyGiftTargetCoin || 0;

    if (previousLuckyGiftTargetCoin <= 0) {
      return res.status(200).json({
        status: false,
        message: "Lucky gift pool is already empty.",
        data: { luckyGiftTargetCoin: 0 },
      });
    }

    const setting = await Setting.findOneAndUpdate({ luckyGiftTargetCoin: { $gt: 0 } }, { $set: { luckyGiftTargetCoin: 0 } }, { new: true, lean: true });

    if (!setting) {
      return res.status(200).json({ status: false, message: "Lucky gift pool is already empty." });
    }

    updateSettingFile(setting);

    return res.status(200).json({
      status: true,
      message: "Lucky gift pool reset successfully.",
      data: {
        previousLuckyGiftTargetCoin,
        luckyGiftTargetCoin: setting.luckyGiftTargetCoin,
      },
    });
  } catch (error) {
    console.error("resetLuckyGiftTargetCoin error:", error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};
