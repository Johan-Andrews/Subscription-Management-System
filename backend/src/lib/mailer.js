const nodemailer = require('nodemailer');
const env = require('../config/env');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    if (env.SMTP_HOST && env.SMTP_USER) {
      transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_PORT === 465,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
      });
    }
  }
  return transporter;
}

const sendMail = async ({ to, subject, html, attachments = [] }) => {
  const mailClient = getTransporter();
  const mailOptions = {
    from: env.MAIL_FROM,
    to,
    subject,
    html,
    attachments,
  };

  if (!mailClient) {
    console.log('[MAILER - DEV SIMULATION] Sending email:', {
      to,
      subject,
      attachmentsCount: attachments.length,
    });
    return { messageId: 'simulated-dev-id' };
  }

  return mailClient.sendMail(mailOptions);
};

module.exports = {
  sendMail,
};

