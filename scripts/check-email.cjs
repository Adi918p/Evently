// Read-only Brevo preflight. This script has no send mode and preserves saved send evidence.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { createMailer } = require('../utils/mailer');

async function main() {
  const envPath = path.resolve(__dirname, '../.env');
  const fileEnv = fs.existsSync(envPath) ? require('dotenv').parse(fs.readFileSync(envPath)) : {};
  const env = { ...fileEnv, ...process.env };
  const result = { checkedAt: new Date().toISOString(), provider: 'brevo', emailSent: false, apiAuthenticated: false, senderVerified: null };
  const mailer = createMailer({ env, fetchImpl: async (...args) => {
    const response = await fetch(...args);
    result.httpStatus = response.status;
    if (response.ok) result.apiAuthenticated = true;
    if ([401, 403].includes(response.status)) {
      const data = await response.clone().json().catch(() => ({}));
      const message = String(data.message || '');
      if (/\bip\b|ip address/i.test(message)) {
        const candidates = message.match(/[a-f0-9:.]+/gi) || [];
        result.blockedAddresses = [...new Set(candidates.map(value => value.replace(/^[.:]+|[.:]+$/g, '')).filter(value => net.isIP(value)))];
        result.settingsUrl = 'https://app.brevo.com/security/authorised_ips';
      }
    }
    return response;
  } });
  try {
    if (mailer.activeTransport() !== 'brevo') throw new Error('Select MAIL_TRANSPORT=brevo to check the Brevo integration.');
    Object.assign(result, await mailer.checkBrevoConfiguration());
  } catch (error) {
    result.code = error.code || 'EMAIL_CONFIGURATION';
    result.error = error.message;
    process.exitCode = 1;
  }
  console.log(JSON.stringify(result, null, 2));
}
main().catch(() => { console.error('Email preflight could not read local configuration.'); process.exitCode = 1; });
