const Api = require("../models/Api");
const ApiKey = require("../models/ApiKeys");
const Usage = require("../models/usage");
const User = require("../models/user");
const generateApiKey = require("../utils/generateApi");
const calculateBill = require("../utils/calculateBill");

const parsePositiveNumber = (value, fallback) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    return fallback;
};

const formatUtcDateKey = (date) => new Date(date).toISOString().slice(0, 10);

const buildUtcDateRange = (startDate, endDate) => {
	const range = [];
	const cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
	const finalDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));

	while (cursor <= finalDate) {
		range.push({
			key: formatUtcDateKey(cursor),
			label: new Intl.DateTimeFormat("en-US", {
				month: "short",
				day: "numeric",
				timeZone: "UTC"
			}).format(cursor)
		});
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}

	return range;
};

const calculateApiCost = (requestCount, pricingPer100Requests) => {
	const baseCost = calculateBill(requestCount);
	const multiplier = Number(pricingPer100Requests || 0.5) / 0.5;
	return Number((baseCost * multiplier).toFixed(2));
};

const createApi = async (req, res) => {
	try {
		const { name, baseUrl, description, pricingPer100Requests, rateLimitPerMinute } = req.body;

		if (!name || !baseUrl) {
			return res.status(400).json({
				success: false,
				message: "name and baseUrl are required"
			});
		}

		const api = await Api.create({
			user: req.user.id,
			name,
			baseUrl,
			description: description || "",
			pricingPer100Requests: parsePositiveNumber(pricingPer100Requests, 0.5),
			rateLimitPerMinute: parsePositiveNumber(rateLimitPerMinute, 60)
		});

		return res.status(201).json({
			success: true,
			data: api
		});
	} catch (error) {
		return res.status(500).json({
			success: false,
			message: "Unable to create API"
		});
	}
};

const listApis = async (req, res) => {
	try {
		const apis = await Api.find({ user: req.user.id }).sort({ createdAt: -1 });
		return res.status(200).json({
			success: true,
			data: apis
		});
	} catch (error) {
		return res.status(500).json({
			success: false,
			message: "Unable to fetch APIs"
		});
	}
};

const getApiCatalog = async (req, res) => {
	try {
		const apis = await Api.find()
			.select("_id name baseUrl description pricingPer100Requests rateLimitPerMinute createdAt user")
			.populate("user", "name email")
			.sort({ createdAt: -1 });

		return res.status(200).json({
			success: true,
			data: apis.map((api) => ({
				_id: api._id,
				name: api.name,
				baseUrl: api.baseUrl,
				description: api.description || "",
				pricingPer100Requests: api.pricingPer100Requests,
				rateLimitPerMinute: api.rateLimitPerMinute,
				provider: {
					name: api.user?.name || "Provider",
					email: api.user?.email || ""
				},
				createdAt: api.createdAt
			}))
		});
	} catch (error) {
		return res.status(500).json({
			success: false,
			message: "Unable to fetch API catalog"
		});
	}
};

const getConsumerOverview = async (req, res) => {
	try {
		const [user, apis] = await Promise.all([
			User.findById(req.user.id).select("plan freeCredits"),
			ApiKey.find({ user: req.user.id, active: true }).select("api key")
		]);

		const apiKeyStrings = apis.map((apiKey) => apiKey.key).filter(Boolean);
		const apiIds = [...new Set(apis.map((apiKey) => String(apiKey.api)).filter(Boolean))];
		const ownedApis = await Api.find({ _id: { $in: apiIds } }).select("_id name baseUrl description pricingPer100Requests rateLimitPerMinute");
		const apiPriceMap = new Map(ownedApis.map((api) => [String(api._id), Number(api.pricingPer100Requests || 0.5)]));
		const apiNameMap = new Map(ownedApis.map((api) => [String(api._id), api.name || "API"]));

		const now = new Date();
		const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
		const weekStartUtc = new Date(todayUtc);
		weekStartUtc.setUTCDate(weekStartUtc.getUTCDate() - 6);
		const monthStartUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

		const [activeApiKeys, totalRequests, totalErrors, latencyAgg] = await Promise.all([
			ApiKey.countDocuments({ user: req.user.id, active: true }),
			Usage.countDocuments({ apiKey: { $in: apiKeyStrings } }),
			Usage.countDocuments({ apiKey: { $in: apiKeyStrings }, status: { $gte: 400 } }),
			Usage.aggregate([
				{ $match: { apiKey: { $in: apiKeyStrings } } },
				{ $group: { _id: null, avgLatency: { $avg: "$latency" } } }
			])
		]);

		const averageLatency = Math.round(latencyAgg[0]?.avgLatency || 0);
		const [dailyUsageDocs, monthlyUsageDocs, responseTimeDocs] = await Promise.all([
			Usage.aggregate([
				{ $match: { apiKey: { $in: apiKeyStrings }, timestamp: { $gte: weekStartUtc } } },
				{
					$group: {
						_id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp", timezone: "UTC" } },
						totalRequests: { $sum: 1 },
						avgLatency: { $avg: "$latency" }
					}
				},
				{ $sort: { _id: 1 } }
			]),
			Usage.aggregate([
				{ $match: { apiKey: { $in: apiKeyStrings }, timestamp: { $gte: monthStartUtc } } },
				{
					$group: {
						_id: {
							day: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp", timezone: "UTC" } },
							api: "$api"
						},
						totalRequests: { $sum: 1 }
					}
				},
				{ $sort: { "_id.day": 1 } }
			]),
			Usage.aggregate([
				{ $match: { apiKey: { $in: apiKeyStrings }, timestamp: { $gte: monthStartUtc } } },
				{
					$group: {
						_id: "$api",
						avgLatency: { $avg: "$latency" }
					}
				},
				{ $sort: { _id: 1 } }
			])
		]);

		const totalRequestsNumber = Number(totalRequests || 0);
		const errorRate = totalRequestsNumber ? Number(((totalErrors / totalRequestsNumber) * 100).toFixed(2)) : 0;

		const dailyUsageMap = new Map(dailyUsageDocs.map((entry) => [entry._id, entry]));
		const dailyUsage = buildUtcDateRange(weekStartUtc, todayUtc).map(({ key, label }) => {
			const entry = dailyUsageMap.get(key);
			return {
				day: label,
				requests: Number(entry?.totalRequests || 0),
				avgLatency: Math.round(entry?.avgLatency || 0)
			};
		});

		const monthlyBuckets = new Map();
		for (const entry of monthlyUsageDocs) {
			const dayKey = entry._id?.day;
			const apiKey = String(entry._id?.api || "");
			if (!dayKey || !apiKey) continue;

			if (!monthlyBuckets.has(dayKey)) {
				monthlyBuckets.set(dayKey, []);
			}

			monthlyBuckets.get(dayKey).push({
				apiId: apiKey,
				totalRequests: Number(entry.totalRequests || 0)
			});
		}

		const cumulativeRequestsByApi = new Map();
		const monthlyCost = buildUtcDateRange(monthStartUtc, todayUtc).map(({ key, label }) => {
			const dayEntries = monthlyBuckets.get(key) || [];
			for (const item of dayEntries) {
				cumulativeRequestsByApi.set(item.apiId, (cumulativeRequestsByApi.get(item.apiId) || 0) + item.totalRequests);
			}

			const dayCost = Array.from(cumulativeRequestsByApi.entries()).reduce((sum, [apiId, requestCount]) => {
				const price = apiPriceMap.get(apiId) || 0.5;
				return sum + calculateApiCost(requestCount, price);
			}, 0);

			return {
				month: label,
				cost: Number(dayCost.toFixed(2))
			};
		});

		const responseTimeByApi = new Map(responseTimeDocs.map((entry) => [String(entry._id), Math.round(entry.avgLatency || 0)]));
		const responseTime = apis
			.map((api) => ({
				api: apiNameMap.get(String(api._id)) || api.name || "API",
				latency: responseTimeByApi.get(String(api._id)) || 0
			}))
			.filter((entry) => entry.latency > 0);

		const recentUsageDocs = apiKeyStrings.length
			? await Usage.find({ apiKey: { $in: apiKeyStrings } }).sort({ timestamp: -1 }).limit(4)
			: [];
		const recentRequests = recentUsageDocs.map((entry, index) => ({
			id: String(entry._id),
			api: apiNameMap.get(String(entry.api)) || "API",
			endpoint: entry.endpoint || "/",
			method: entry.method || "GET",
			status: entry.status || 200,
			latency: entry.latency || 0,
			timestamp: entry.timestamp || new Date().toISOString(),
			requestId: `REQ-${index + 1}`
		}));

		const currentUsageCost = Number(monthlyCost[monthlyCost.length - 1]?.cost || 0);
		return res.status(200).json({
			success: true,
			data: {
				plan: user?.plan || "free",
				freeCredits: Number(user?.freeCredits || 0),
				activeApiKeys,
				avgLatency: averageLatency,
				activeSubscriptions: ownedApis.length,
				requestsThisMonth: totalRequestsNumber,
				currentUsageCost,
				errorRate,
					apis: ownedApis.map((api) => ({
					_id: api._id,
					name: api.name,
					baseUrl: api.baseUrl,
					description: api.description || "",
					pricingPer100Requests: api.pricingPer100Requests,
					rateLimitPerMinute: api.rateLimitPerMinute,
					provider: {
						name: "MeterFlow",
						email: ""
					}
					})),
					subscriptions: ownedApis.map((api) => ({
						id: api._id,
						name: api.name,
						baseUrl: api.baseUrl,
						description: api.description || "",
						pricingPer100Requests: api.pricingPer100Requests,
						rateLimitPerMinute: api.rateLimitPerMinute,
						provider: {
							name: "MeterFlow",
							email: ""
						}
					})),
					recentRequests,
					invoices: [],
					usageAlerts: []
			}
		});
	} catch (error) {
		return res.status(500).json({
			success: false,
			message: "Unable to fetch consumer overview"
		});
	}
};

const createApiKeyForApi = async (req, res) => {
	try {
		const { apiId } = req.params;
		const api = await Api.findById(apiId);

		if (!api) {
			return res.status(404).json({
				success: false,
				message: "API not found"
			});
		}

		const apiKeyDoc = await ApiKey.create({
			user: req.user.id,
			api: api._id,
			key: generateApiKey(),
			active: true
		});

		const user = await User.findById(req.user.id);
		if (user) {
			user.freeCredits = Math.max(Number(user.freeCredits || 0) - 10, 0);
			await user.save();
		}

		const activeApiKeys = await ApiKey.countDocuments({ user: req.user.id, active: true });

		return res.status(201).json({
			success: true,
			data: {
				...apiKeyDoc.toObject(),
				remainingFreeCredits: user?.freeCredits ?? 0,
				activeApiKeys
			}
		});
	} catch (error) {
		return res.status(500).json({
			success: false,
			message: "Unable to create API key"
		});
	}
};

const getApiKeysForApi = async (req, res) => {
	try {
		const { apiId } = req.params;
		const api = await Api.findOne({ _id: apiId, user: req.user.id });

		if (!api) {
			return res.status(404).json({
				success: false,
				message: "API not found"
			});
		}

		const keys = await ApiKey.find({ api: api._id }).sort({ createdAt: -1 });
		return res.status(200).json({
			success: true,
			data: keys
		});
	} catch (error) {
		return res.status(500).json({
			success: false,
			message: "Unable to fetch API keys"
		});
	}
};

const getUsageSummary = async (req, res) => {
	try {
		const { apiId } = req.params;
		const api = await Api.findOne({ _id: apiId, user: req.user.id });

		if (!api) {
			return res.status(404).json({
				success: false,
				message: "API not found"
			});
		}

		const [summary] = await Usage.aggregate([
			{ $match: { api: api._id } },
			{
				$group: {
					_id: null,
					totalRequests: { $sum: 1 },
					avgLatency: { $avg: "$latency" },
					errorCount: {
						$sum: {
							$cond: [{ $gte: ["$status", 400] }, 1, 0]
						}
					}
				}
			}
		]);

		const result = {
			totalRequests: summary?.totalRequests || 0,
			avgLatency: Math.round(summary?.avgLatency || 0),
			errorCount: summary?.errorCount || 0
		};

		return res.status(200).json({
			success: true,
			data: result
		});
	} catch (error) {
		return res.status(500).json({
			success: false,
			message: "Unable to fetch usage summary"
		});
	}
};

const getBillingSummary = async (req, res) => {
	try {
		const { apiId } = req.params;
		const api = await Api.findOne({ _id: apiId, user: req.user.id });

		if (!api) {
			return res.status(404).json({
				success: false,
				message: "API not found"
			});
		}

		const totalRequests = await Usage.countDocuments({ api: api._id });
		const rawAmount = calculateBill(totalRequests);
		const amount = Math.max(rawAmount * (api.pricingPer100Requests / 0.5), 0);

		return res.status(200).json({
			success: true,
			data: {
				totalRequests,
				amount: Number(amount.toFixed(2)),
				currency: "INR"
			}
		});
	} catch (error) {
		return res.status(500).json({
			success: false,
			message: "Unable to fetch billing summary"
		});
	}
};

const getDashboardOverview = async (req, res) => {
	try {
		const apis = await Api.find({ user: req.user.id }).select("_id name baseUrl pricingPer100Requests rateLimitPerMinute");
		const apiIds = apis.map((api) => api._id);

		const [
			activeApiKeys,
			totalRequests,
			totalErrors,
			latencyAgg
		] = await Promise.all([
			ApiKey.countDocuments({ api: { $in: apiIds }, active: true }),
			Usage.countDocuments({ api: { $in: apiIds } }),
			Usage.countDocuments({ api: { $in: apiIds }, status: { $gte: 400 } }),
			Usage.aggregate([
				{ $match: { api: { $in: apiIds } } },
				{ $group: { _id: null, avgLatency: { $avg: "$latency" } } }
			])
		]);

		const estimatedRevenue = calculateBill(totalRequests);

		return res.status(200).json({
			success: true,
			data: {
				summary: {
					activeApis: apis.length,
					totalRequests,
					activeApiKeys,
					errorRate: totalRequests ? Number(((totalErrors / totalRequests) * 100).toFixed(2)) : 0,
					avgLatency: Math.round(latencyAgg[0]?.avgLatency || 0),
					estimatedRevenue: Number(estimatedRevenue.toFixed(2))
				},
				charts: {
					dailyUsage,
					monthlyCost,
					responseTime,
					successErrorMix: [
						{ name: "Successful", value: Math.max(totalRequestsNumber - totalErrors, 0) },
						{ name: "Errors", value: totalErrors }
					]
				},
				apis
			}
		});
	} catch (error) {
		return res.status(500).json({
			success: false,
			message: "Unable to fetch dashboard overview"
		});
	}
};

module.exports = {
	createApi,
	listApis,
	getApiCatalog,
	getConsumerOverview,
	createApiKeyForApi,
	getApiKeysForApi,
	getUsageSummary,
	getBillingSummary,
	getDashboardOverview
};
