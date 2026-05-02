const mongoose = require("mongoose");

const usageSchema = new mongoose.Schema({
    api: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "API",
        index: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        index: true
    },
    apiKey: {
        type: String,
        index: true
    },
    endpoint: String,
    method: String,
    status: Number,
    latency: Number,
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
});

module.exports = mongoose.model("Usage", usageSchema);