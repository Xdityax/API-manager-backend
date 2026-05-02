const crypto = require("crypto");

const generateApiKey = () => {
    return "mf_" + crypto.randomBytes(32).toString("hex");
};

module.exports = generateApiKey;