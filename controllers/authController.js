const bcrypt = require("bcryptjs");
const User = require("../models/user");
const generateToken = require("../utils/generateToken");

const ALLOWED_REGISTER_ROLES = new Set(["owner", "consumer", "provider"]);

const normalizeRole = (role) => {
    if (role === "provider") return "owner";
    return role;
};

const sanitizeUser = (userDoc) => ({
    id: userDoc._id,
    name: userDoc.name,
    email: userDoc.email,
    role: userDoc.role,
    plan: userDoc.plan,
    freeCredits: userDoc.freeCredits,
    createdAt: userDoc.createdAt
});

const register = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "name, email and password are required"
            });
        }

        const normalizedRole = normalizeRole(role || "owner");
        if (!ALLOWED_REGISTER_ROLES.has(role || "owner") || normalizedRole === "admin") {
            return res.status(400).json({
                success: false,
                message: "Invalid role. Allowed roles are provider and consumer"
            });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Email already registered"
            });
        }

        const user = await User.create({
            name,
            email: email.toLowerCase(),
            password,
            role: normalizedRole
        });

        return res.status(201).json({
            success: true,
            token: generateToken(user._id, user.role),
            user: sanitizeUser(user)
        });
    } catch (error) {
        console.error("Auth register error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to register"
        });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "email and password are required"
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials"
            });
        }

        return res.status(200).json({
            success: true,
            token: generateToken(user._id, user.role),
            user: sanitizeUser(user)
        });
    } catch (error) {
        console.error("Auth login error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to login"
        });
    }
};

const me = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("-password");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        return res.status(200).json({
            success: true,
            user: sanitizeUser(user)
        });
    } catch (error) {
        console.error("Auth me error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to fetch user"
        });
    }
};

module.exports = {
    register,
    login,
    me
};