const path = require('path');
const fs = require('fs');
const multer = require('multer');
const AppError = require('../utils/AppError');

const uploadPath = path.resolve(process.env.PRIVATE_UPLOAD_PATH || 'private_documents');
fs.mkdirSync(uploadPath, { recursive: true });

const allowedTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);

module.exports = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadPath),
    filename: (_req, file, cb) => {
      const extension = path.extname(file.originalname).toLowerCase();
      cb(null, `proof-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
    },
  }),
  fileFilter: (_req, file, cb) => allowedTypes.has(file.mimetype)
    ? cb(null, true)
    : cb(new AppError('Documento deve ser PDF, JPG ou PNG', 400), false),
  limits: { fileSize: 5 * 1024 * 1024 },
});
