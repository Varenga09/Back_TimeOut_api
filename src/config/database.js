require('dotenv').config();

const dbName = process.env.DB_NAME || 'local_food_db';
const dbPort = Number(process.env.DB_PORT) || 3306;

const baseConfig = {
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

const mysqlConfig = {
  ...baseConfig,
  dialect: 'mysql',
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || null,
  database: dbName,
  host: process.env.DB_HOST || 'localhost',
  port: dbPort,
};

const postgresConfig = {
  ...baseConfig,
  dialect: 'postgres',
  use_env_variable: 'DATABASE_URL',
  dialectOptions:
    process.env.DB_SSL === 'true'
      ? {
          ssl: {
            require: true,
            rejectUnauthorized: false,
          },
        }
      : undefined,
};

module.exports = {
  development: {
    ...mysqlConfig,
  },
  test: {
    ...mysqlConfig,
    database: process.env.DB_NAME ? `${process.env.DB_NAME}_test` : 'local_food_db_test',
    logging: false,
  },
  production: process.env.DATABASE_URL
    ? postgresConfig
    : {
        ...mysqlConfig,
        pool: {
          max: 20,
          min: 5,
          acquire: 60000,
          idle: 10000,
        },
      },
};
