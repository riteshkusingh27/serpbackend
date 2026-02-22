const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');

dotenv.config();
// url https://delicate-lebkuchen-3924c3.netlify.app
const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://localhost:5174,https://delicate-lebkuchen-3924c3.netlify.app,https://onesolutions.tech';
const normalizeOrigin = (origin) => (origin || '').replace(/\/+$/g, '');
const isLocalhost = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\\d+)?$/i.test(normalizeOrigin(origin));
const ALLOWED_ORIGINS = FRONTEND_ORIGIN.split(',')
  .map((origin) => normalizeOrigin(origin.trim()))
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      const normalizedOrigin = normalizeOrigin(origin);
      if (!origin || ALLOWED_ORIGINS.includes(normalizedOrigin) || isLocalhost(origin)) {
        return callback(null, true);
      }

      console.warn('Blocked by CORS:', { origin });
      return callback(new Error('Not allowed by CORS'));
    }
  })
);
// Parse JSON bodies and simple HTML form submissions
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.post('/api/contact', async (req, res) => {
  const { name, email, project, budget, details, message } = req.body || {};

  // Allow either the old project/budget/details combo or the simpler name/email/message payloads
  const hasContent = Boolean(details || project || budget || message);
  if (!name || !email || !hasContent) {
    return res
      .status(400)
      .json({ error: 'name, email, and at least one of message/details/project/budget are required' });
  }

  const transporterConfigured = Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.CONTACT_TO
  );

  if (!transporterConfigured) {
    console.warn('SMTP not configured. Contact payload logged instead of sending.');
    // console.info({ name, email, project, budget, details });
    return res.status(202).json({
      status: 'queued',
      message: 'Email sending not configured yet; message logged for review.'
    });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const fromAddress = process.env.CONTACT_FROM || process.env.SMTP_USER;

    const lines = [];
    if (project) lines.push(`Project: ${project}`);
    if (budget) lines.push(`Budget: ${budget}`);
    if (details) lines.push(`Details: ${details}`);
    if (message) lines.push(`Message: ${message}`);

    const plainBody = [...lines, '', `From: ${name} (${email})`].filter(Boolean).join('\n');

    const htmlLines = lines.map((line) => `<p>${line}</p>`).join('');
    const htmlBody = `
      ${htmlLines}
      <p>From: ${name} (${email})</p>
    `;

    const info = await transporter.sendMail({
      from: `${name} <${fromAddress}>`,
      to: process.env.CONTACT_TO,
      subject: `Project Inquiry from ${name}`,
      replyTo: email,
      text: plainBody,
      html: htmlBody
    });

    if ((info?.rejected && info.rejected.length) || (info?.pending && info.pending.length)) {
      console.warn('Email sent with rejections', { rejected: info.rejected, pending: info.pending });
    } else {
      console.log('Email accepted by SMTP');
    }

    res.status(200).json({ status: 'sent', message: 'Thanks for reaching out. We will contact you soon.' });
  } catch (err) {
    console.error('Error sending contact email', err);
    res.status(500).json({ error: 'Failed to send message. Please try again later.' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
