const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');

dotenv.config();

const app = express();
app.disable('x-powered-by');
const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://serpvidya.app/',
  'https://delicate-lebkuchen-3924c3.netlify.app',
  'https://onesolutions.tech',
  'https://www.onesolutions.tech'
];

const normalizeOrigin = (origin) => (origin || '').replace(/\/+$/g, '');
const envOrigins = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((origin) => normalizeOrigin(origin.trim()))
  .filter(Boolean);

const ALLOWED_ORIGINS = Array.from(new Set([...envOrigins, ...DEFAULT_ORIGINS])).map(normalizeOrigin);

const corsOptions = {
  origin: (origin, callback) => {
    const normalizedOrigin = normalizeOrigin(origin);
    if (!origin || ALLOWED_ORIGINS.includes(normalizedOrigin)) {
      return callback(null, true);
    }
    console.warn('Blocked by CORS', { origin });
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
// Parse JSON bodies and simple HTML form submissions
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.post('/api/contact', async (req, res) => {
  const { name, email, message, institution, address, project, budget, details } = req.body || {};

  // Accept both the simpler message payload and the project/budget/details variant used by older forms
  const hasContent = Boolean(message || details || project || budget);
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
    console.info({ name, email, institution, address, message });
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
    if (institution) lines.push(`Institution: ${institution}`);
    if (address) lines.push(`Address: ${address}`);

    const plainBody = [...lines, '', `From: ${name} (${email})`].filter(Boolean).join('\n');

    const htmlLines = lines.map((line) => `<p>${line}</p>`).join('');
    const htmlBody = `
      ${htmlLines}
      <p>From: ${name} (${email})</p>
    `;

    const info = await transporter.sendMail({
      from: `SERP Vidya ERP <${fromAddress}>`,
      to: process.env.CONTACT_TO,
      subject: `School ERP inquiry from ${name}`,
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

module.exports = (req, res) => app(req, res);