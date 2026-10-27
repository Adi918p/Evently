const crypto = require('crypto');
const AuthHandoff = require('../models/AuthHandoff');
const { HttpError } = require('./httpError');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const cookieOptions = () => ({ httpOnly: true, secure: new URL(process.env.FRONTEND_URL || 'http://localhost:5173').protocol === 'https:', sameSite: 'lax', path: '/api/auth' });
const cookieValue = (req, key) => String(req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${key}=`))?.slice(key.length + 1) || '';
async function issue(res, kind, user) {
    const value = crypto.randomBytes(32).toString('hex');
    const seconds = kind === 'state' ? 600 : 120;
    await AuthHandoff.create({ hash: hash(value), kind, user, expiresAt: new Date(Date.now() + seconds * 1000) });
    res.cookie(`evently_oauth_${kind}`, value, { ...cookieOptions(), maxAge: seconds * 1000 });
    return value;
}
async function consume(req, res, kind, queryValue) {
    const value = cookieValue(req, `evently_oauth_${kind}`);
    res.clearCookie(`evently_oauth_${kind}`, cookieOptions());
    if (!/^[a-f0-9]{64}$/.test(value) || (queryValue !== undefined && queryValue !== value)) throw new HttpError(400, 'Google sign-in expired or did not start in this browser. Please try again.');
    const record = await AuthHandoff.findOneAndDelete({ hash: hash(value), kind, expiresAt: { $gt: new Date() } });
    if (!record) throw new HttpError(400, 'Google sign-in expired. Please try again.');
    return record;
}
module.exports = { issue, consume };
