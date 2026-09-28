const GiftCategory = require("../../models/giftCategory.model");
const Gift = require("../../models/gift.model");

//create giftCategory
exports.addGiftCategory = async (req, res) => {
  try {
    const { name } = req.query;

    if (!name) {
      return res.status(200).json({ status: false, message: "Category name is required." });
    }

    const [existingCategory] = await Promise.all([GiftCategory.findOne({ name: name.trim() })]);

    if (existingCategory) {
      if (existingCategory.isDelete) {
        existingCategory.isDelete = false;
        await existingCategory.save();

        return res.status(200).json({
          status: true,
          message: "Gift category re-activated successfully.",
          data: existingCategory,
        });
      }
    }

    const category = new GiftCategory({ name });
    await category.save();

    return res.status(200).json({
      status: true,
      message: "Gift category created successfully.",
      data: category,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//update giftCategory
exports.modifyGiftCategory = async (req, res) => {
  try {
    const { categoryId, name } = req.query;

    if (!categoryId || !name) {
      return res.status(200).json({ status: false, message: "Category ID and name are required." });
    }

    const trimmedName = name.trim();

    const [existingCategory, currentCategory] = await Promise.all([
      GiftCategory.findOne({ name: trimmedName, _id: { $ne: categoryId } }).lean(),
      GiftCategory.findById(categoryId).select("_id").lean(),
    ]);

    if (!currentCategory) {
      return res.status(200).json({ status: false, message: "Gift category not found." });
    }

    if (existingCategory) {
      return res.status(200).json({ status: false, message: "Gift category with this name already exists." });
    }

    const updatedCategory = await GiftCategory.findByIdAndUpdate(categoryId, { name: trimmedName }, { new: true, select: "_id name createdAt" }).lean();

    return res.status(200).json({
      status: true,
      message: "Gift category updated successfully.",
      data: updatedCategory,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//retrieve all giftCategories
exports.fetchGiftCategories = async (req, res) => {
  try {
    const categories = await GiftCategory.find({ isDelete: false }).select("_id name createdAt updatedAt").lean();

    return res.status(200).json({
      status: true,
      message: "Gift categories retrieved successfully.",
      data: categories,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};

//delete giftCategory
exports.removeGiftCategory = async (req, res) => {
  try {
    const { categoryId } = req.query;
    if (!categoryId) {
      return res.status(200).json({ status: false, message: "Category ID is required." });
    }

    const updatedCategory = await GiftCategory.findById(categoryId).select("_id").lean();

    if (!updatedCategory) {
      return res.status(200).json({ status: false, message: "Gift category not found." });
    }

    res.status(200).json({
      status: true,
      message: "Gift category marked as deleted successfully.",
    });

    //await Promise.all([GiftCategory.findByIdAndUpdate(categoryId, { isDelete: true }), Gift.updateMany({ giftCategoryId: categoryId }, { $set: { isDelete: true } })]);
    await Promise.all([GiftCategory.findByIdAndDelete(categoryId), Gift.deleteMany({ giftCategoryId: categoryId })]);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ status: false, message: error.message || "Internal Server Error" });
  }
};
