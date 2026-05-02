const mongoose = require("mongoose");

const apiSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        baseUrl: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String,
            default: ""
        },
        pricingPer100Requests: {
            type: Number,
            default: 0.5,
            min: 0
        },
        rateLimitPerMinute: {
            type: Number,
            default: 60,
            min: 1
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("API", apiSchema);