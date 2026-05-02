const axios = require("axios");
const Usage = require("../models/usage");
const User = require("../models/user");

const inMemoryKeyWindow = new Map();

const checkRateLimit = (key, maxPerMinute) => {
    const now = Date.now();
    const state = inMemoryKeyWindow.get(key);

    if (!state || now - state.windowStart >= 60_000) {
        inMemoryKeyWindow.set(key, {
            windowStart: now,
            count: 1
        });
        return true;
    }

    if (state.count >= maxPerMinute) {
        return false;
    }

    state.count += 1;
    return true;
};

const proxyRequest = async (req, res) => {
    const started = Date.now();

    try {
        const { apiId } = req.params;
        const { endpoint = "/", payload } = req.body;
        const apiRecord = req.apiKey?.api;

        if (!apiRecord) {
            return res.status(400).json({
                success: false,
                message: "API metadata not found for API key"
            });
        }

        if (String(apiRecord._id) !== String(apiId)) {
            return res.status(403).json({
                success: false,
                message: "API key is not valid for this API"
            });
        }

        const limit = apiRecord.rateLimitPerMinute || 60;
        const isAllowed = checkRateLimit(req.apiKey.key, limit);

        if (!isAllowed) {
            return res.status(429).json({
                success: false,
                message: `Rate limit exceeded. Allowed ${limit} requests/minute.`
            });
        }

        const targetUrl = new URL(endpoint, apiRecord.baseUrl).toString();

        const safeHeaders = { ...req.headers };
        delete safeHeaders.host;
        delete safeHeaders["x-api-key"];

        const response = await axios({
            method: req.method,
            url: targetUrl,
            data: payload,
            headers: safeHeaders,
            timeout: 10000
        });

        await Usage.create({
            api: apiRecord._id,
            user: req.apiKey.user || apiRecord.user,
            apiKey: req.apiKey.key,
            endpoint,
            method: req.method,
            status: response.status,
            latency: Date.now() - started
        });

        // Deduct free credits from the consumer that owns the API key.
        try {
            const consumerId = req.apiKey.user || apiRecord.user;
            if (consumerId) {
                const consumer = await User.findById(consumerId).select("freeCredits");
                if (consumer) {
                    const next = Math.max(0, (consumer.freeCredits || 0) - 10);
                    if (next !== consumer.freeCredits) {
                        await User.findByIdAndUpdate(consumer._id, { freeCredits: next });
                    }
                }
            }
        } catch (creditErr) {
            // swallow credit update errors to avoid interfering with proxy response
        }

        return res.status(response.status).json(response.data);
    } catch (error) {
        const status = error.response?.status || 500;

        try {
            if (req.apiKey?.api?._id) {
                await Usage.create({
                    api: req.apiKey.api._id,
                    user: req.apiKey.user || req.apiKey.api.user,
                    apiKey: req.apiKey.key,
                    endpoint: req.body?.endpoint || "/",
                    method: req.method,
                    status,
                    latency: Date.now() - started
                });

                // Deduct free credits even for failed proxied requests.
                try {
                    const consumerId = req.apiKey.user || req.apiKey.api.user;
                    if (consumerId) {
                        const consumer = await User.findById(consumerId).select("freeCredits");
                        if (consumer) {
                            const next = Math.max(0, (consumer.freeCredits || 0) - 10);
                            if (next !== consumer.freeCredits) {
                                await User.findByIdAndUpdate(consumer._id, { freeCredits: next });
                            }
                        }
                    }
                } catch (creditErr2) {
                    // swallow
                }
            }
        } catch (usageError) {
            // Intentionally swallow usage logging errors to avoid masking proxy failures.
        }

        return res.status(status).json({
            success: false,
            message: "Failed to forward request"
        });
    }
};

module.exports = {
    proxyRequest,
    forwardRequest: proxyRequest
};
