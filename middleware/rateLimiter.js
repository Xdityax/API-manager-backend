const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const Redis = require("ioredis");

const limiterOptions = {
    windowMs: 60 * 1000,
    max: 100
};

if (process.env.REDIS_URL) {
    const redisClient = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 2,
        enableOfflineQueue: true,
        lazyConnect: true
    });

    // Prevent unhandled Redis errors from crashing the process.
    redisClient.on("error", (error) => {
        console.error("Rate limiter Redis error:", error.message);
    });

    try {
        limiterOptions.store = new RedisStore({
            sendCommand: (...args) => redisClient.call(...args)
        });
    } catch (error) {
        console.error("Rate limiter Redis store disabled:", error.message);
    }
}

const limiter = rateLimit(limiterOptions);

module.exports = limiter;