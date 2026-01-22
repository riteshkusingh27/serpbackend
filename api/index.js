const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');

dotenv.config();

const app = express();
app.disable('x-powered-by');
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173,http://localhost:5174';
const ALLOWED_ORIGINS = FRONTEND_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.post('/api/contact', async (req, res) => {
  const { name, email, message, institution, address } = req.body || {};

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'name, email, and message are required' });
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

    const institutionLine = institution ? `Institution: ${institution}\n` : '';
    const addressLine = address ? `Address: ${address}\n` : '';

    const plainBody = `${message}\n\nFrom: ${name} (${email})\n${institutionLine}${addressLine}`;
    const htmlBody = `
      <p>${message}</p>
      <p>From: ${name} (${email})</p>
      ${institution ? `<p><strong>Institution:</strong> ${institution}</p>` : ''}
      ${address ? `<p><strong>Address:</strong> ${address}</p>` : ''}
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