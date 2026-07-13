const mysql = require('mysql');
const dotenv = require('dotenv');

dotenv.config();

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

console.log('Attempting to connect with:');
console.log('Host:', process.env.DB_HOST);
console.log('User:', process.env.DB_USER);
console.log('Database:', process.env.DB_NAME);

db.connect((err) => {
  if (err) {
    console.error('Connection FAILED:', err);
    process.exit(1);
  }
  console.log('Connection SUCCESSFUL!');
  process.exit(0);
});
