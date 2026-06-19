const roleMiddleware = (...allowedRoles) => {

    return (req, res, next) => {

        if (!allowedRoles.includes(req.user.role)) {

            return res.status(403).json({
                success: false,
                message: "Access Denied"
            });

        }

        next();
    };

};

// middleware/auth.js

const requireAdmin = (req, res, next) => {

    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ message: "Access Denied" });
    }

    next();
};
module.exports = {roleMiddleware,requireAdmin};