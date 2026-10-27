const mongoose = require('mongoose');
const purchases = require('../services/purchases');
const Purchase = require('../models/Purchase');
const { HttpError, respondError } = require('../utils/httpError');
exports.createOrder = async (req, res) => {
    try { res.json(await purchases.present(await purchases.createOrder(req.user.id, req.body))); }
    catch (err) { respondError(res, err); }
};
exports.verifyPayment = async (req, res) => {
    try {
        const purchase = await purchases.verify(req.user.id, req.body);
        res.status(purchase.state === 'pending' ? 202 : 200).json(await purchases.present(purchase));
    } catch (err) { respondError(res, err); }
};
exports.status = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Purchase not found.');
        const purchase = await Purchase.findOne({ _id: req.params.id, user: req.user.id });
        if (!purchase) throw new HttpError(404, 'Purchase not found.');
        res.set('Cache-Control', 'no-store').json(await purchases.present(purchase));
    } catch (err) { respondError(res, err); }
};
exports.webhook = async (req, res) => {
    try {
        const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!secret) throw new HttpError(503, 'Webhook is not configured.');
        if (!Buffer.isBuffer(req.body) || !purchases.signatureMatches(purchases.digest(req.body, secret), req.get('x-razorpay-signature'))) throw new HttpError(400, 'Invalid webhook signature.');
        let payload;
        try { payload = JSON.parse(req.body.toString('utf8')); } catch { throw new HttpError(400, 'Invalid webhook payload.'); }
        const payment = payload.payload?.payment?.entity;
        const order = payload.payload?.order?.entity;
        const refund = payload.payload?.refund?.entity;
        const orderId = payment?.order_id || order?.id;
        let purchase = orderId ? await Purchase.findOne({ orderId }) : null;
        const hinted = order?.notes?.purchaseId || payment?.notes?.purchaseId;
        if (!purchase && mongoose.isValidObjectId(hinted)) purchase = await Purchase.findById(hinted);
        if (!purchase && refund?.payment_id) purchase = await Purchase.findOne({ paymentId: refund.payment_id });
        if (purchase) await purchases.reconcile(purchase);
        res.json({ success: true });
    } catch (err) { respondError(res, err); }
};
