require('dotenv').config();

const app = require('./app');
const { sequelize } = require('./models');

const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    await sequelize.authenticate();
    console.log('Conexao com o banco de dados estabelecida com sucesso.');

    app.listen(PORT, () => {
      console.log(`LocalFood API rodando em http://localhost:${PORT}`);
      console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Base URL: http://localhost:${PORT}/api/v1`);
    });
  } catch (error) {
    console.error('Erro ao conectar com o banco de dados:', error.message);
    console.error('Verifique se o MySQL está rodando e se o .env está correto.');
    process.exit(1);
  }
}

startServer();
