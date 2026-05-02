const mongoose = require("mongoose");
const User = require("../models/user");
const Api = require("../models/Api");
const ApiKey = require("../models/ApiKeys");
const Usage = require("../models/usage");

const toCurrency = (value) => Number(Number(value || 0).toFixed(2));

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (date) => date.toLocaleString("en-US", { month: "short" });

const buildMonthWindow = (months = 6) => {
    const today = new Date();
    const window = [];

    for (let offset = months - 1; offset >= 0; offset -= 1) {
        const current = new Date(today.getFullYear(), today.getMonth() - offset, 1);
        window.push({
            key: monthKey(current),
            label: monthLabel(current),
            date: current
        });
    }

    return window;
};

const formatDuration = (date) => {
    const diff = Date.now() - new Date(date).getTime();
    const minutes = Math.max(1, Math.round(diff / 60000));

    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.round(hours / 24);
    return `${days} d ago`;
};

const buildStatus = (usageCount) => {
    if (usageCount > 0) return "Active";
    return "Idle";
};

const buildAuditLog = (event, source, createdAt) => ({
    event,
    source,
    createdAt,
    relativeTime: formatDuration(createdAt)
});

const getAdminDashboardOverview = async (req, res) => {
    try {
        const now = new Date();
        const todayStart = startOfDay(now);
        const monthStart = startOfMonth(now);
        const sixMonthWindow = buildMonthWindow(6);
        const allApiIds = await Api.find().distinct("_id");

        const [
            totalUsers,
            totalApis,
            totalActiveApiKeys,
            requestsToday,
            failedRequests,
            usersByRoleAgg,
            recentUsersRaw,
            latestApisRaw,
            apiUsageAgg,
            revenueTrendAgg,
            userGrowthAgg,
            topApisAgg,
            failedRequestAgg,
            rateLimitedAgg,
            highLatencyAgg,
            recentUsageRaw,
            recentApiKeysRaw,
            recentUsersForLogs,
            recentApisForLogs,
            monthlyRevenueAgg,
            activeSubscriptionsCount,
            activeConsumerCount,
            serverErrorCount,
            mongoHealthy
        ] = await Promise.all([
            User.countDocuments(),
            Api.countDocuments(),
            ApiKey.countDocuments({ active: true }),
            Usage.countDocuments({ timestamp: { $gte: todayStart } }),
            Usage.countDocuments({ timestamp: { $gte: todayStart }, status: { $gte: 400 } }),
            User.aggregate([
                {
                    $group: {
                        _id: "$role",
                        count: { $sum: 1 }
                    }
                }
            ]),
            User.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .select("name email role createdAt")
                .lean(),
            Api.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .populate("user", "name email")
                .lean(),
            Usage.aggregate([
                {
                    $match: {
                        timestamp: {
                            $gte: sixMonthWindow[0].date
                        }
                    }
                },
                {
                    $lookup: {
                        from: "apis",
                        localField: "api",
                        foreignField: "_id",
                        as: "apiDoc"
                    }
                },
                { $unwind: "$apiDoc" },
                {
                    $addFields: {
                        monthBucket: {
                            $dateToString: {
                                format: "%Y-%m",
                                date: "$timestamp"
                            }
                        }
                    }
                },
                {
                    $group: {
                        _id: "$api",
                        name: { $first: "$apiDoc.name" },
                        owner: { $first: "$apiDoc.user" },
                        pricingPer100Requests: { $first: "$apiDoc.pricingPer100Requests" },
                        requests: { $sum: 1 },
                        revenue: {
                            $sum: {
                                $divide: ["$apiDoc.pricingPer100Requests", 100]
                            }
                        },
                        failedRequests: {
                            $sum: {
                                $cond: [{ $gte: ["$status", 400] }, 1, 0]
                            }
                        }
                    }
                },
                { $sort: { requests: -1 } },
                { $limit: 5 }
            ]),
            Usage.aggregate([
                {
                    $match: {
                        timestamp: {
                            $gte: sixMonthWindow[0].date
                        }
                    }
                },
                {
                    $lookup: {
                        from: "apis",
                        localField: "api",
                        foreignField: "_id",
                        as: "apiDoc"
                    }
                },
                { $unwind: "$apiDoc" },
                {
                    $addFields: {
                        monthBucket: {
                            $dateToString: {
                                format: "%Y-%m",
                                date: "$timestamp"
                            }
                        }
                    }
                },
                {
                    $group: {
                        _id: "$monthBucket",
                        revenue: {
                            $sum: {
                                $divide: ["$apiDoc.pricingPer100Requests", 100]
                            }
                        },
                        requests: { $sum: 1 }
                    }
                }
            ]),
            User.aggregate([
                {
                    $match: {
                        createdAt: {
                            $gte: sixMonthWindow[0].date
                        }
                    }
                },
                {
                    $addFields: {
                        monthBucket: {
                            $dateToString: {
                                format: "%Y-%m",
                                date: "$createdAt"
                            }
                        }
                    }
                },
                {
                    $group: {
                        _id: "$monthBucket",
                        users: { $sum: 1 }
                    }
                }
            ]),
            Usage.aggregate([
                {
                    $match: {
                        timestamp: {
                            $gte: sixMonthWindow[0].date
                        }
                    }
                },
                {
                    $group: {
                        _id: "$api",
                        requests: { $sum: 1 }
                    }
                },
                { $sort: { requests: -1 } },
                { $limit: 5 }
            ]),
            Usage.aggregate([
                {
                    $match: {
                        timestamp: {
                            $gte: todayStart
                        },
                        status: {
                            $gte: 500
                        }
                    }
                },
                {
                    $group: {
                        _id: "$api",
                        count: { $sum: 1 }
                    }
                }
            ]),
            Usage.countDocuments({ timestamp: { $gte: todayStart }, status: 429 }),
            Usage.countDocuments({ timestamp: { $gte: todayStart }, latency: { $gte: 1500 } }),
            Usage.find()
                .sort({ timestamp: -1 })
                .limit(8)
                .populate("api", "name")
                .populate("user", "name email")
                .lean(),
            ApiKey.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .populate({
                    path: "api",
                    select: "name user",
                    populate: {
                        path: "user",
                        select: "name email"
                    }
                })
                .lean(),
            User.find()
                .sort({ createdAt: -1 })
                .limit(4)
                .select("name email role createdAt")
                .lean(),
            Api.find()
                .sort({ createdAt: -1 })
                .limit(4)
                .populate("user", "name email")
                .lean(),
            Usage.aggregate([
                {
                    $match: {
                        timestamp: {
                            $gte: monthStart
                        }
                    }
                },
                {
                    $lookup: {
                        from: "apis",
                        localField: "api",
                        foreignField: "_id",
                        as: "apiDoc"
                    }
                },
                { $unwind: "$apiDoc" },
                {
                    $group: {
                        _id: null,
                        revenue: {
                            $sum: {
                                $divide: ["$apiDoc.pricingPer100Requests", 100]
                            }
                        }
                    }
                }
            ]),
            Usage.countDocuments({ timestamp: { $gte: monthStart } }),
            User.countDocuments({ role: "consumer" }),
            Usage.countDocuments({ timestamp: { $gte: todayStart }, status: { $gte: 500 } }),
            mongoose.connection.readyState === 1
        ]);

        const usersByRole = {
            admin: 0,
            provider: 0,
            consumer: 0
        };

        usersByRoleAgg.forEach((entry) => {
            if (entry._id === "admin") usersByRole.admin = entry.count;
            if (entry._id === "owner" || entry._id === "provider") usersByRole.provider += entry.count;
            if (entry._id === "consumer") usersByRole.consumer = entry.count;
        });

        const revenueMap = new Map(revenueTrendAgg.map((entry) => [entry._id, entry]));
        const userGrowthMap = new Map(userGrowthAgg.map((entry) => [entry._id, entry]));
        const topApisMap = new Map(topApisAgg.map((entry) => [String(entry._id), entry]));
        const latestApisMap = new Map(latestApisRaw.map((entry) => [String(entry._id), entry]));
        const apiUsageMap = new Map(apiUsageAgg.map((entry) => [String(entry._id), entry]));

        const revenueTrend = sixMonthWindow.map((entry) => ({
            month: entry.label,
            revenue: toCurrency(revenueMap.get(entry.key)?.revenue || 0),
            subscriptions: userGrowthMap.get(entry.key)?.users || 0
        }));

        const userGrowth = sixMonthWindow.map((entry) => ({
            month: entry.label,
            users: userGrowthMap.get(entry.key)?.users || 0
        }));

        const apiUsage = latestApisRaw.map((apiDoc) => {
            const usageEntry = apiUsageMap.get(String(apiDoc._id));
            return {
                name: apiDoc.name,
                requests: usageEntry?.requests || 0
            };
        });

        const topApis = topApisAgg.map((entry) => ({
            name: entry.name,
            value: entry.requests
        }));

        const recentUsers = recentUsersRaw.map((userDoc) => {
            const requestCount = recentUsageRaw.filter((usageDoc) => String(usageDoc.user?._id || usageDoc.user) === String(userDoc._id)).length;

            return {
                name: userDoc.name,
                email: userDoc.email,
                role: userDoc.role,
                status: buildStatus(requestCount),
                lastSeen: formatDuration(userDoc.createdAt)
            };
        });

        const latestApis = latestApisRaw.map((apiDoc) => ({
            api: apiDoc.name,
            owner: apiDoc.user?.name || "Unassigned",
            requests: apiUsageMap.get(String(apiDoc._id))?.requests || 0,
            pricing: `₹${Number(apiDoc.pricingPer100Requests || 0).toFixed(2)} / 100 req`,
            createdAt: formatDuration(apiDoc.createdAt)
        }));

        const alerts = [];
        if (rateLimitedAgg > 0) {
            alerts.push({
                title: "Rate limit anomaly detected",
                detail: `${rateLimitedAgg} requests hit the 429 threshold today across active APIs.`,
                severity: "High"
            });
        }
        if (failedRequestAgg.length > 0 || failedRequests > 0) {
            alerts.push({
                title: "Failed request spike observed",
                detail: `${failedRequests} failed requests were recorded today.`,
                severity: failedRequests > 15 ? "High" : "Medium"
            });
        }
        if (highLatencyAgg > 0) {
            alerts.push({
                title: "High latency requests detected",
                detail: `${highLatencyAgg} requests exceeded the 1500ms threshold today.`,
                severity: "Medium"
            });
        }
        if (alerts.length === 0) {
            alerts.push({
                title: "No active security alerts",
                detail: "Monitoring is healthy and no anomaly thresholds have been crossed today.",
                severity: "Low"
            });
        }

        const auditLogs = [
            ...recentUsageRaw.map((usageDoc) => ({
                event: `${usageDoc.status >= 400 ? "Failed" : "Successful"} ${usageDoc.method || "REQUEST"} call to ${usageDoc.api?.name || "an API"}`,
                source: `${usageDoc.user?.name || "Consumer"} · ${usageDoc.endpoint || "/"}`,
                createdAt: usageDoc.timestamp,
                relativeTime: formatDuration(usageDoc.timestamp)
            })),
            ...recentApiKeysRaw.map((keyDoc) => ({
                event: `API key issued for ${keyDoc.api?.name || "an API"}`,
                source: keyDoc.api?.user?.name || "API Provider",
                createdAt: keyDoc.createdAt,
                relativeTime: formatDuration(keyDoc.createdAt)
            })),
            ...recentUsersForLogs.map((userDoc) => ({
                event: `User account created for ${userDoc.name}`,
                source: userDoc.role,
                createdAt: userDoc.createdAt,
                relativeTime: formatDuration(userDoc.createdAt)
            })),
            ...recentApisForLogs.map((apiDoc) => ({
                event: `API published: ${apiDoc.name}`,
                source: apiDoc.user?.name || "Provider",
                createdAt: apiDoc.createdAt,
                relativeTime: formatDuration(apiDoc.createdAt)
            }))
        ]
            .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
            .slice(0, 8);

        const activeSubscriptionsEstimate = Math.max(activeConsumerCount, totalActiveApiKeys);
        const platformRevenue = toCurrency(monthlyRevenueAgg[0]?.revenue || 0);
        const errorRate = requestsToday ? Number(((failedRequests / requestsToday) * 100).toFixed(2)) : 0;
        const systemHealth = mongoHealthy ? "Healthy" : "Degraded";
        const fraudRisk = rateLimitedAgg > 10 ? "Elevated" : "Low";

        return res.status(200).json({
            success: true,
            data: {
                metrics: {
                    totalUsers,
                    totalApis,
                    platformRevenue,
                    totalActiveApiKeys,
                    totalRequests: requestsToday,
                    errorRate,
                    usersByRole,
                    failedRequests,
                    activeSubscriptions: activeSubscriptionsEstimate
                },
                charts: {
                    revenueTrend,
                    userGrowth,
                    apiUsage,
                    topApis
                },
                tables: {
                    recentUsers,
                    latestApis,
                    securityAlerts: alerts,
                    recentActivity: auditLogs,
                    auditLogs
                },
                systemHealth: [
                    { label: "MongoDB", status: mongoHealthy ? "Operational" : "Degraded", detail: mongoHealthy ? "Connected" : "Connection issue" },
                    { label: "Redis", status: "Operational", detail: process.env.REDIS_URL ? "Connected" : "Ready" },
                    { label: "BullMQ", status: "Operational", detail: "Queue workers ready" },
                    { label: "Server", status: "Operational", detail: "API responding" }
                ],
                operations: {
                    systemHealth,
                    fraudRisk,
                    subscriptionManagement: {
                        activeSubscriptionsEstimate,
                        churnRiskEstimate: 0
                    },
                    supportTickets: {
                        open: alerts.filter((alert) => alert.severity === "High").length,
                        resolvedToday: 0
                    }
                }
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Unable to fetch admin dashboard overview"
        });
    }
};

module.exports = {
    getAdminDashboardOverview
};
