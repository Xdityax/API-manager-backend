const jwt = require("jsonwebtoken");
const User = require("../models/user");

const normalizeRole = (role) => {
    if (role === "provider") return "owner";
    return role;
};

const protect = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization || "";
        const token = authHeader.startsWith("Bearer ")
            ? authHeader.split(" ")[1]
            : null;

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Not authorized"
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select("_id role");

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found"
            });
        }

        req.user = {
            id: String(user._id),
            role: normalizeRole(user.role)
        };
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid token"
        });
    }
};

const authorizeRoles = (...roles) => {
    const allowedRoles = new Set(roles.map(normalizeRole));

    return (req, res, next) => {
        if (!req.user?.role || !allowedRoles.has(normalizeRole(req.user.role))) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to access this resource"
            });
        }

        next();
    };
};

module.exports = protect;
module.exports.protect = protect;
module.exports.authorizeRoles = authorizeRoles;
