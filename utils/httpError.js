class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}
const respondError = (res, error) => {
    const status = error.status || (error.name === 'ValidationError' || error.name === 'CastError' ? 400 : 503);
    if (status >= 500) console.error('Request failed:', error.message);
    return res.status(status).json({ success: false, message: status >= 500 ? 'The service is temporarily unavailable. Please retry shortly.' : error.message });
};
module.exports = { HttpError, respondError };
