require("dotenv").config({ path: ".env" });
const mongoose = require("mongoose");

// Models
const Admin = require("./models/admin.model");
const GiftCategory = require("./models/giftCategory.model");
const Gift = require("./models/gift.model");
const HostLevel = require("./models/hostLevel.model");
const WealthLevel = require("./models/wealthLevel.model");
const CoinPlan = require("./models/coinPlan.model");

const seedData = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MongoDb_Connection_String);
    console.log("✅ Connected to MongoDB");

    // =====================
    // 1. ADMIN USER
    // =====================
    const existingAdmin = await Admin.findOne({ email: "admin@lifeislive.net" });
    if (!existingAdmin) {
      await Admin.create({
        uid: "admin_001",
        name: "Super Admin",
        email: "admin@lifeislive.net",
        password: "admin123",
        image: "",
      });
      console.log("✅ Admin user created");
    } else {
      console.log("⏭️  Admin user already exists");
    }

    // =====================
    // 2. GIFT CATEGORIES
    // =====================
    const giftCategories = [
      { name: "Popular" },
      { name: "Love" },
      { name: "Luxury" },
      { name: "Party" },
      { name: "Gaming" },
      { name: "Nature" },
      { name: "Festival" },
      { name: "Lucky" },
    ];

    const createdCategories = [];
    for (const category of giftCategories) {
      const existing = await GiftCategory.findOne({ name: category.name });
      if (!existing) {
        const created = await GiftCategory.create(category);
        createdCategories.push(created);
        console.log(`✅ Gift category created: ${category.name}`);
      } else {
        createdCategories.push(existing);
        console.log(`⏭️  Gift category exists: ${category.name}`);
      }
    }

    // =====================
    // 3. GIFTS
    // =====================
    const popularCategory = createdCategories.find(c => c.name === "Popular");
    const loveCategory = createdCategories.find(c => c.name === "Love");
    const luxuryCategory = createdCategories.find(c => c.name === "Luxury");
    const partyCategory = createdCategories.find(c => c.name === "Party");
    const luckyCategory = createdCategories.find(c => c.name === "Lucky");

    const gifts = [
      // Popular gifts
      { giftCategoryId: popularCategory?._id, title: "Rose", type: 1, coin: 10 },
      { giftCategoryId: popularCategory?._id, title: "Star", type: 1, coin: 20 },
      { giftCategoryId: popularCategory?._id, title: "Coffee", type: 1, coin: 50 },
      { giftCategoryId: popularCategory?._id, title: "Ice Cream", type: 1, coin: 100 },

      // Love gifts
      { giftCategoryId: loveCategory?._id, title: "Heart", type: 1, coin: 50 },
      { giftCategoryId: loveCategory?._id, title: "Kiss", type: 1, coin: 100 },
      { giftCategoryId: loveCategory?._id, title: "Teddy Bear", type: 1, coin: 200 },
      { giftCategoryId: loveCategory?._id, title: "Love Letter", type: 1, coin: 500 },

      // Luxury gifts
      { giftCategoryId: luxuryCategory?._id, title: "Diamond Ring", type: 1, coin: 1000 },
      { giftCategoryId: luxuryCategory?._id, title: "Crown", type: 1, coin: 2000 },
      { giftCategoryId: luxuryCategory?._id, title: "Sports Car", type: 1, coin: 5000 },
      { giftCategoryId: luxuryCategory?._id, title: "Yacht", type: 1, coin: 10000 },
      { giftCategoryId: luxuryCategory?._id, title: "Private Jet", type: 1, coin: 50000 },
      { giftCategoryId: luxuryCategory?._id, title: "Castle", type: 1, coin: 100000 },

      // Party gifts
      { giftCategoryId: partyCategory?._id, title: "Balloon", type: 1, coin: 30 },
      { giftCategoryId: partyCategory?._id, title: "Fireworks", type: 1, coin: 300 },
      { giftCategoryId: partyCategory?._id, title: "Confetti", type: 1, coin: 150 },
      { giftCategoryId: partyCategory?._id, title: "Champagne", type: 1, coin: 500 },

      // Lucky gifts
      { giftCategoryId: luckyCategory?._id, title: "Lucky Coin", type: 1, coin: 100 },
      { giftCategoryId: luckyCategory?._id, title: "Lucky Star", type: 1, coin: 500 },
      { giftCategoryId: luckyCategory?._id, title: "Lucky Box", type: 1, coin: 1000 },
    ];

    for (const gift of gifts) {
      const existing = await Gift.findOne({ title: gift.title });
      if (!existing) {
        await Gift.create(gift);
        console.log(`✅ Gift created: ${gift.title} (${gift.coin} coins)`);
      } else {
        console.log(`⏭️  Gift exists: ${gift.title}`);
      }
    }

    // =====================
    // 4. HOST LEVELS
    // =====================
    const hostLevels = [
      { name: "Beginner", level: 1, description: "New host", requiredCoin: 0, requiredLiveDuration: 0 },
      { name: "Bronze", level: 2, description: "Active host", requiredCoin: 1000, requiredLiveDuration: 60 },
      { name: "Silver", level: 3, description: "Popular host", requiredCoin: 5000, requiredLiveDuration: 300 },
      { name: "Gold", level: 4, description: "Star host", requiredCoin: 20000, requiredLiveDuration: 1000 },
      { name: "Platinum", level: 5, description: "Elite host", requiredCoin: 50000, requiredLiveDuration: 3000 },
      { name: "Diamond", level: 6, description: "VIP host", requiredCoin: 100000, requiredLiveDuration: 6000 },
      { name: "Crown", level: 7, description: "Legendary host", requiredCoin: 500000, requiredLiveDuration: 15000 },
    ];

    for (const hostLevel of hostLevels) {
      const existing = await HostLevel.findOne({ level: hostLevel.level });
      if (!existing) {
        await HostLevel.create(hostLevel);
        console.log(`✅ Host level created: ${hostLevel.name} (Level ${hostLevel.level})`);
      } else {
        console.log(`⏭️  Host level exists: ${hostLevel.name}`);
      }
    }

    // =====================
    // 5. WEALTH LEVELS
    // =====================
    const wealthLevels = [
      {
        level: 1,
        levelName: "Newcomer",
        coinThreshold: 0,
        permissions: { liveStreaming: true, freeCall: false, redeemCashout: false, uploadSocialPost: true, uploadVideo: false },
      },
      {
        level: 2,
        levelName: "Regular",
        coinThreshold: 500,
        permissions: { liveStreaming: true, freeCall: false, redeemCashout: false, uploadSocialPost: true, uploadVideo: true },
      },
      {
        level: 3,
        levelName: "VIP",
        coinThreshold: 2000,
        permissions: { liveStreaming: true, freeCall: true, redeemCashout: false, uploadSocialPost: true, uploadVideo: true },
      },
      {
        level: 4,
        levelName: "Elite",
        coinThreshold: 10000,
        permissions: { liveStreaming: true, freeCall: true, redeemCashout: true, uploadSocialPost: true, uploadVideo: true },
      },
      {
        level: 5,
        levelName: "Tycoon",
        coinThreshold: 50000,
        permissions: { liveStreaming: true, freeCall: true, redeemCashout: true, uploadSocialPost: true, uploadVideo: true },
      },
      {
        level: 6,
        levelName: "Legend",
        coinThreshold: 200000,
        permissions: { liveStreaming: true, freeCall: true, redeemCashout: true, uploadSocialPost: true, uploadVideo: true },
      },
    ];

    for (const wealthLevel of wealthLevels) {
      const existing = await WealthLevel.findOne({ level: wealthLevel.level });
      if (!existing) {
        await WealthLevel.create(wealthLevel);
        console.log(`✅ Wealth level created: ${wealthLevel.levelName} (Level ${wealthLevel.level})`);
      } else {
        console.log(`⏭️  Wealth level exists: ${wealthLevel.levelName}`);
      }
    }

    // =====================
    // 6. COIN PLANS
    // =====================
    const coinPlans = [
      { coin: 100, amount: 0.99, productKey: "coin_100", isPopular: false },
      { coin: 500, amount: 4.99, productKey: "coin_500", isPopular: false },
      { coin: 1000, amount: 9.99, productKey: "coin_1000", isPopular: true },
      { coin: 2500, amount: 19.99, productKey: "coin_2500", isPopular: false },
      { coin: 5000, amount: 39.99, productKey: "coin_5000", isPopular: true },
      { coin: 10000, amount: 74.99, productKey: "coin_10000", isPopular: false },
      { coin: 25000, amount: 149.99, productKey: "coin_25000", isPopular: false },
      { coin: 50000, amount: 249.99, productKey: "coin_50000", isPopular: false },
    ];

    for (const coinPlan of coinPlans) {
      const existing = await CoinPlan.findOne({ coin: coinPlan.coin });
      if (!existing) {
        await CoinPlan.create(coinPlan);
        console.log(`✅ Coin plan created: ${coinPlan.coin} coins ($${coinPlan.amount})`);
      } else {
        console.log(`⏭️  Coin plan exists: ${coinPlan.coin} coins`);
      }
    }

    console.log("\n🎉 Seed completed successfully!");
    console.log("\n📋 Admin Login:");
    console.log("   Email: admin@lifeislive.net");
    console.log("   Password: admin123");

    process.exit(0);
  } catch (error) {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  }
};

seedData();
