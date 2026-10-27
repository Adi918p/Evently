const mongoose = require('mongoose');
const schema = new mongoose.Schema({
    hash: { type: String, unique: true, required: true },
    kind: { type: String, enum: ['state', 'handoff'], required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    expiresAt: { type: Date, required: true, expires: 0 },
});
module.exports = mongoose.model('AuthHandoff', schema);
