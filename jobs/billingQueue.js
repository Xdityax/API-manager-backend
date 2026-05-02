const { Queue } = require("bullmq");
const Redis = require("ioredis");

let billingQueue = null;

if (process.env.REDIS_URL) {
	const connection = new Redis(process.env.REDIS_URL, {
		maxRetriesPerRequest: 1,
		enableOfflineQueue: false
	});

	connection.on("error", (error) => {
		console.error("Billing queue Redis error:", error.message);
	});

	billingQueue = new Queue("billing", {
		connection
	});
}

module.exports = billingQueue;