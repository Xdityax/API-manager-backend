const ApiKey = require("../models/ApiKeys");

const validateApiKey = async (req, res, next) => {
    try {
        const key = req.headers["x-api-key"];

        if (!key) {
            return res.status(401).json({
                success: false,
                message: "API Key Missing"
            });
        }

        const apiKey = await ApiKey.findOne({
            key,
            active: true,
            expiresAt: { $gt: new Date() }
        }).populate("api");

        if (!apiKey) {
            return res.status(403).json({
                success: false,
                message: "Invalid or Inactive API Key"
            });
        }

        req.apiKey = apiKey;
        next();
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Authentication failed"
        });
    }
};

module.exports = validateApiKey;