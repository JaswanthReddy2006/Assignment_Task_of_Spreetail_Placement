const sequelize = require('./db');

async function verify() {
  try {
    await sequelize.authenticate();
    console.log('✅ Successfully connected to AWS RDS!');
    
    const [results] = await sequelize.query('SHOW TABLES;');
    console.log('📊 Tables currently existing on AWS RDS:');
    console.log(results);
  } catch (error) {
    console.error('❌ Failed to verify database:', error.message);
  } finally {
    await sequelize.close();
  }
}

verify();
