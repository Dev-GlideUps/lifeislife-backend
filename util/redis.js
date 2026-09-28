const redis = require("redis");

const client = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: process.env.REDIS_PORT || 6379,
  },
  password: process.env.REDIS_PASSWORD || undefined,
});

client
  .connect()
  .then(() => {
    console.log("🚀 Redis connected successfully");
  })
  .catch((err) => {
    console.error("❌ Redis connection error:", err);
  });

client.on("error", (err) => {
  console.error("Redis Client Error:", err);
});

module.exports = client;
