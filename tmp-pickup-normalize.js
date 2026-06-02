require('dotenv').config();
const mysql = require('mysql2/promise');
(async ()=>{
  const db = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
  });
  const [result] = await db.query("UPDATE orders SET slot='Store Pickup' WHERE delivery_method='pickup' AND slot != 'Store Pickup'");
  console.log(result);
  await db.end();
})();
