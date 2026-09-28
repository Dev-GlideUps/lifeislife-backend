const Currency = require("../../models/currency.model");

//import model
const Setting = require("../../models/setting.model");

//create currency
exports.addCurrency = async (req, res) => {
  try {
    if (!req.body.name || !req.body.symbol || !req.body.countryCode || !req.body.currencyCode) {
      return res.status(200).json({ status: false, message: "Oops ! Invalid details." });
    }

    const currency = new Currency();
    currency.name = req.body.name;
    currency.symbol = req.body.symbol;
    currency.countryCode = req.body.countryCode;
    currency.currencyCode = req.body.currencyCode;
    await currency.save();

    return res.status(200).json({
      status: true,
      message: "Currency create Successfully",
      data: currency,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server error" });
  }
};

//update currency
exports.modifyCurrency = async (req, res) => {
  try {
    const currencyId = req.body.currencyId;
    if (!currencyId) {
      return res.status(200).json({ status: false, message: "Oops ! Invalid details!!" });
    }

    const currency = await Currency.findById(currencyId);
    if (!currency) {
      return res.status(200).json({ status: false, message: "currency Not Found!!" });
    }

    currency.name = req.body.name ? req.body.name : currency.name;
    currency.symbol = req.body.symbol ? req.body.symbol : currency.symbol;
    currency.countryCode = req.body.countryCode ? req.body.countryCode : currency.countryCode;
    currency.currencyCode = req.body.currencyCode ? req.body.currencyCode : currency.currencyCode;
    await currency.save();

    return res.status(200).json({
      status: true,
      message: "Currency updated Successfully",
      data: currency,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server error" });
  }
};

//get all currencies
exports.retrieveCurrencyInfo = async (req, res) => {
  try {
    const currency = await Currency.find().sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      status: true,
      message: "Currency fetch Successfully",
      data: currency,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};

//delete currency
exports.deactivateCurrency = async (req, res) => {
  try {
    const currencyId = req.query.currencyId;
    if (!currencyId) {
      return res.status(200).json({ status: false, message: "Oops ! Invalid details!" });
    }

    const [currency, currencyCount] = await Promise.all([Currency.findById(currencyId), Currency.countDocuments()]);

    if (!currency) {
      return res.status(200).json({ status: false, message: "Oops ! Currency does not found." });
    }

    if (currencyCount === 1) {
      return res.status(200).json({ status: false, message: "You cannot delete the last currency." });
    }

    if (currency.isDefault) {
      return res.status(200).json({ status: false, message: "The default currency could not be deleted." });
    }

    res.status(200).json({ status: true, message: "Currency deleted Successfully" });

    await currency.deleteOne();
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server error" });
  }
};

//set default currency
exports.updateDefaultCurrency = async (req, res) => {
  try {
    const currencyId = req.query.currencyId;
    if (!currencyId) {
      return res.status(200).json({ status: false, message: "Oops! Invalid details." });
    }

    const [defaultCurrencyCount, currency, setting, currencyCount] = await Promise.all([
      Currency.countDocuments({ isDefault: true }),
      Currency.findById(currencyId),
      Setting.findOne().sort({ createdAt: -1 }),
      Currency.countDocuments(),
      Currency.updateMany({}, { isDefault: false }),
    ]);

    if (!currency) {
      return res.status(200).json({ status: false, message: "Currency not found." });
    }

    if (!setting) {
      return res.status(200).json({ status: false, message: "Setting not found." });
    }

    if (defaultCurrencyCount === 1 && currency.isDefault) {
      return res.status(200).json({ status: false, message: "At least one currency must be set as default." });
    }

    if (currencyCount > 1) {
      await Currency.updateMany({ _id: { $ne: currencyId } }, { isDefault: false });
    }

    currency.isDefault = true;
    setting.currency = {
      name: currency.name,
      symbol: currency.symbol,
      countryCode: currency.countryCode,
      currencyCode: currency.currencyCode,
      isDefault: currency.isDefault,
    };

    await Promise.all([currency.save(), setting.save()]);

    const allCurrency = await Currency.find().sort({ createdAt: -1 });

    res.status(200).json({
      status: true,
      message: "Default currency updated successfully.",
      data: allCurrency,
    });

    updateSettingFile(setting);

    try {
      setTimeout(() => {
        console.log("Restarting server after currency update...");
        process.exit(0);
      }, 500); // 0.5s delay
      return;
    } catch (err) {
      console.error("Failed to update currency:", err);
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server error" });
  }
};

//get default currency
exports.retrieveDefaultCurrency = async (req, res) => {
  try {
    const currency = await Currency.findOne({ isDefault: true }).lean();

    return res.status(200).json({
      status: true,
      message: "Currency fetch Successfully",
      data: currency,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ status: false, error: error.message || "Internal Server Error" });
  }
};
