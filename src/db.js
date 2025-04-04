require('dotenv').config()
const { Sequelize } = require('sequelize')

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USERNAME,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'mssql',
    logging: false,
    dialectOptions: {
      options: {
        instanceName: 'MSSQLSERVER01',
        encrypt: true,
        trustServerCertificate: true,
      },
    },
  },
)

const gbplus = new Sequelize(
  process.env.DB_NAME_GBPLUS,
  process.env.DB_USERNAME,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'mssql',
    logging: false,
    dialectOptions: {
      options: {
        instanceName: 'MSSQLSERVER01',
        encrypt: true,
        trustServerCertificate: true,
      },
    },
  },
)

module.exports = {
  sequelize,
  gbplus,
}
