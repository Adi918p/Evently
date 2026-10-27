const { rateLimit } = require('express-rate-limit');
const make = (limit, minutes = 15) => rateLimit({ windowMs: minutes * 60_000, limit, standardHeaders: 'draft-8', legacyHeaders: false, message: { success: false, message: 'Too many attempts. Please wait and try again.' } });
module.exports = { authentication: make(40), email: make(8), contact: make(8), upload: make(30), purchase: make(40), api: make(1200) };
