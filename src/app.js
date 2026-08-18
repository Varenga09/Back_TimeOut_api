require('dotenv').config();

const cors = require('cors');
const express = require('express');
const morgan = require('morgan');
const path = require('path');

const routes = require('./routes');
const errorMiddleware = require('./middlewares/errorMiddleware');
const { errorResponse } = require('./utils/response');

const app = express();

const corsOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins.includes('*') ? true : corsOrigins,
    credentials: true,
  })
);

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.resolve(process.env.UPLOAD_PATH || 'uploads')));
app.use('/api/v1', routes);

app.use((req, res) => {
  return errorResponse(res, `Rota '${req.originalUrl}' não encontrada`, 404);
});

app.use(errorMiddleware);

module.exports = app;
