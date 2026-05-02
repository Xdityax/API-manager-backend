const mongoose = require("mongoose");

const apiKeySchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            index: true
        },
        api: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "API",
            required: true
        },
        key: {
            type: String,
            required: true,
            unique: true
        },
        active: {
            type: Boolean,
            default: true
        },
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 2 * 60 * 60 * 1000),
        }
    },
    {
        timestamps: true
    }
);

apiKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("ApiKey", apiKeySchema);