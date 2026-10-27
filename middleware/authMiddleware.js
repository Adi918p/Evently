const jwt = require("jsonwebtoken");
const User = require('../models/User');

const authM = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                message: "No token provided"
            });
        }

        if (!/^Bearer \S+$/i.test(authHeader)) return res.status(401).json({ message: 'Invalid authorization header' });
        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        const account = await User.findById(decoded.id).select('name email role status isEmailVerified');
        if (!account || account.status !== 'active' || !account.isEmailVerified) return res.status(401).json({ message: 'This account is not permitted to sign in.' });
        req.user = { id: String(account._id), name: account.name, email: account.email, role: account.role };

        next();

    } catch (err) {
        if (!['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError', 'CastError'].includes(err.name)) return res.status(503).json({ message: 'Account verification is temporarily unavailable.' });
        return res.status(401).json({
            message: "Invalid token"
        });
    }
};
const requireAuth = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: "Not logged in" });
    }
    next();
};
module.exports = {authM,requireAuth};
