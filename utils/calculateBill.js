const calculateBill = (requests) => {
    if (requests <= 1000) return 0;
    return ((requests - 1000) / 100) * 0.5;
};

module.exports = calculateBill;