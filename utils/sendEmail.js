const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({

    service: "gmail",

    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }

});

const sendEmail = async (
    to,
    subject,
    html,
    attachment
) => {
    const mailOptions = {

        from:
            `"Evently" <${process.env.EMAIL_USER}>`,

        to,

        subject,

        html,
    };

    if (attachment) {
        mailOptions.attachments = [
            {
                filename: "ticket.pdf",
                path: attachment
            }
        ];
    }

    await transporter.sendMail(mailOptions);
};

module.exports = sendEmail;