const { Sequelize } = require('sequelize');
const mysql = require('mysql2/promise');
require('dotenv').config();

let sequelize;

if (process.env.DATABASE_URL) {
  // Parse the DATABASE_URL
  const connectionUrl = new URL(process.env.DATABASE_URL);
  const host = connectionUrl.hostname;
  const port = connectionUrl.port || 3306;
  const username = connectionUrl.username;
  const password = connectionUrl.password;
  
  // Use a custom user database name instead of the system 'mysql' database
  let database = connectionUrl.pathname.substring(1);
  if (!database || database === 'mysql') {
    database = 'shared_expenses';
  }

  sequelize = new Sequelize(database, username, password, {
    host,
    port,
    dialect: 'mysql',
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  });

  // Override sync to ensure the database schema exists first
  const originalSync = sequelize.sync.bind(sequelize);
  sequelize.sync = async (options) => {
    try {
      const connection = await mysql.createConnection({
        host,
        port,
        user: username,
        password,
        ssl: { rejectUnauthorized: false }
      });
      await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\`;`);
      await connection.end();
      console.log(`Ensured database '${database}' exists.`);
    } catch (err) {
      console.warn('Pre-sync database check failed:', err.message);
    }
    return originalSync(options);
  };
} else {
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './database.sqlite',
    logging: false,
  });
}

module.exports = sequelize;
