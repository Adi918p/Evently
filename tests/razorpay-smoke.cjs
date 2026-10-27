// Explicit opt-in test-mode provider smoke check. Creates an unpaid Rs 1 test order only.
const fs = require('node:fs');
const path = require('node:path');
const env = require('dotenv').parse(fs.readFileSync(path.resolve(__dirname, '../.env')));
if (!process.argv.includes('--test-mode') || !env.RAZORPAY_KEY_ID?.startsWith('rzp_test_')) throw new Error('This check only supports explicitly selected Razorpay test credentials.');
async function main() {
    const razorpay = new (require('razorpay'))({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
    const order = await razorpay.orders.create({ amount: 100, currency: 'INR', receipt: `evently_smoke_${Date.now()}`, notes: { purpose: 'Unpaid integration smoke test' } });
    const fetched = await razorpay.orders.fetch(order.id);
    if (fetched.amount !== 100 || fetched.currency !== 'INR' || fetched.status !== 'created') throw new Error('Unexpected test order response');
    const result = { checkedAt: new Date().toISOString(), mode: 'test', orderCreation: 'passed', orderFetch: 'passed', amountPaise: 100, currency: 'INR', paymentCreated: false, charged: false };
    fs.writeFileSync(path.resolve(__dirname, '../audit/razorpay-smoke.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
}
main().catch(error => { console.error(JSON.stringify({ result: 'failed', code: error.statusCode || error.error?.code || 'REQUEST_FAILED' })); process.exitCode = 1; });
