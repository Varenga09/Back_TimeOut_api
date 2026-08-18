require('dotenv').config();

const dbName = process.env.DB_NAME || 'local_food_db';
const dbPort = Number(process.env.DB_PORT) || 3306;

const baseConfig = {
  dialect: 'mysql',
  logging: process.env.DB_LOGGING === 'true' ? console.log : false,
  define: {
    underscored: false,
    freezeTableName: true,
  },
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
};

module.exports = {
  development: {
    ...baseConfig,
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || null,
    database: dbName,
    host: process.env.DB_HOST || 'localhost',
    port: dbPort,
  },
  test: {
    ...baseConfig,
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || null,
    database: process.env.DB_NAME ? `${process.env.DB_NAME}_test` : 'local_food_db_test',
    host: process.env.DB_HOST || 'localhost',
    port: dbPort,
    logging: false,
  },
  production: {
    ...baseConfig,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: dbPort,
    pool: {
      max: 20,
      min: 5,
      acquire: 60000,
      idle: 10000,
    },
  },
};
