const express = require('express');
const path = require('path');
const mysql = require('mysql');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname)); // Serve frontend files

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// MySQL connection setup
const connectionConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || ''
};

// If a database is specified in .env, connect directly to it
if (process.env.DB_NAME) {
  connectionConfig.database = process.env.DB_NAME;
}

const db = mysql.createConnection(connectionConfig);

db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL server:', err);
    return;
  }
  console.log('Successfully connected to MySQL server.');

  const dbName = process.env.DB_NAME || 'threadflow_db';
  
  const setupTables = () => {
    const createUsers = `CREATE TABLE IF NOT EXISTS users (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, username VARCHAR(80) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;`;
    const createOrders = `CREATE TABLE IF NOT EXISTS orders (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, order_number VARCHAR(40) NOT NULL UNIQUE, party VARCHAR(150) NOT NULL, count_label VARCHAR(50) DEFAULT '', quality VARCHAR(100) NOT NULL, yarn DECIMAL(10,3) NOT NULL DEFAULT 0, shade VARCHAR(100) NOT NULL, quantity INT NOT NULL, order_date DATE NOT NULL, due_date DATE NULL, production INT NOT NULL DEFAULT 0, dyeing INT NOT NULL DEFAULT 0, dispatched INT NOT NULL DEFAULT 0, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX(party), INDEX(order_date)) ENGINE=InnoDB;`;
    const createLots = `CREATE TABLE IF NOT EXISTS lots (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, order_id BIGINT UNSIGNED NOT NULL, lot_type ENUM('dyeing','production') NOT NULL, lot_number TINYINT NOT NULL, entry_date DATE NOT NULL, quantity INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, CONSTRAINT fk_lot_order FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE) ENGINE=InnoDB;`;
    const createDispatches = `CREATE TABLE IF NOT EXISTS dispatches (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, order_id BIGINT UNSIGNED NOT NULL, dispatch_date DATE NOT NULL, quantity INT NOT NULL, reference_no VARCHAR(100) DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, CONSTRAINT fk_dispatch_order FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE) ENGINE=InnoDB;`;

    db.query(createUsers, (err) => { if(err) console.error(err); });
    db.query(createOrders, (err) => {
      if(err) console.error(err);
      else {
        db.query(createLots, (err) => { if(err) console.error(err); });
        db.query(createDispatches, (err) => { if(err) console.error(err); });
      }
    });
    console.log('Database and tables ready.');
  };

  // If we connected without database, create and select it
  if (!process.env.DB_NAME) {
    db.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``, (err) => {
      if (err) return console.error('Error creating database:', err);
      db.changeUser({ database: dbName }, (err) => {
        if (err) return console.error('Error switching to database:', err);
        setupTables();
      });
    });
  } else {
    setupTables();
  }
});

// GET all orders
app.get('/api/orders', (req, res) => {
  const query = 'SELECT * FROM orders ORDER BY created_at DESC';
  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.post('/api/orders', (req, res) => {
  let { order_number, party, count_label, quality, yarn, shade, quantity, order_date, due_date } = req.body;
  if (!order_number) order_number = 'ORD-' + Date.now().toString().slice(-6) + '-' + Math.floor(Math.random() * 9999);
  if (!due_date || due_date.trim() === '') due_date = null;
  
  const query = 'INSERT INTO orders (order_number, party, count_label, quality, yarn, shade, quantity, order_date, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
  db.query(query, [order_number, party, count_label || '', quality, yarn || 0, shade, quantity, order_date, due_date], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(Object.assign({ id: results.insertId, order_number }, req.body));
  });
});

// DELETE order
app.delete('/api/orders/:id', (req, res) => {
  const query = 'DELETE FROM orders WHERE id = ?';
  db.query(query, [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true });
  });
});

app.post('/api/orders/import', (req, res) => {
  const rows = req.body.rows || [];
  if (rows.length === 0) return res.json({ success: true, count: 0 });
  
  let inserted = 0;
  let errors = 0;
  let completed = 0;
  const insertQuery = 'INSERT INTO orders (order_number, party, count_label, quality, yarn, shade, quantity, order_date, production, dispatched) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  
  rows.forEach((row) => {
    const order_number = 'IMP-' + Date.now().toString().slice(-6) + '-' + Math.floor(Math.random() * 9999);
    db.query(insertQuery, [
      order_number, 
      row.party, 
      row.count_label || '', 
      row.quality || '', 
      row.yarn || 0, 
      row.shade || '', 
      row.quantity, 
      row.order_date, 
      row.production || 0, 
      row.dispatched || 0
    ], (err) => {
      if (err) {
        console.error(err);
        errors++;
      } else {
        inserted++;
      }
      
      completed++;
      if (completed === rows.length) {
        res.json({ success: true, count: inserted });
      }
    });
  });
});

// GET all lots
app.get('/api/lots', (req, res) => {
  const query = 'SELECT lots.*, orders.order_number, orders.party FROM lots JOIN orders ON lots.order_id = orders.id ORDER BY lots.created_at DESC';
  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// POST new lot
app.post('/api/lots', (req, res) => {
  const { order_number, lot_type, lot_number, entry_date, quantity } = req.body;
  db.query('SELECT id FROM orders WHERE order_number = ?', [order_number], (err, orderResults) => {
    if (err || orderResults.length === 0) return res.status(500).json({ error: 'Order not found' });
    const order_id = orderResults[0].id;
    
    const query = 'INSERT INTO lots (order_id, lot_type, lot_number, entry_date, quantity) VALUES (?, ?, ?, ?, ?)';
    db.query(query, [order_id, lot_type, lot_number, entry_date, quantity], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      const updateField = lot_type === 'production' ? 'production' : 'dyeing';
      db.query(`UPDATE orders SET ${updateField} = ${updateField} + ? WHERE id = ?`, [quantity, order_id], (err) => {
        if (err) console.error('Failed to update order count:', err);
      });

      res.json({ id: results.insertId, order_id, lot_type, lot_number, entry_date, quantity });
    });
  });
});

// GET all dispatches
app.get('/api/dispatches', (req, res) => {
  const query = 'SELECT dispatches.*, orders.order_number as orderId, orders.party FROM dispatches JOIN orders ON dispatches.order_id = orders.id ORDER BY dispatches.created_at DESC';
  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// POST new dispatch
app.post('/api/dispatches', (req, res) => {
  const { order_number, dispatch_date, quantity, reference_no } = req.body;
  db.query('SELECT id FROM orders WHERE order_number = ?', [order_number], (err, orderResults) => {
    if (err || orderResults.length === 0) return res.status(500).json({ error: 'Order not found' });
    const order_id = orderResults[0].id;
    
    const query = 'INSERT INTO dispatches (order_id, dispatch_date, quantity, reference_no) VALUES (?, ?, ?, ?)';
    db.query(query, [order_id, dispatch_date, quantity, reference_no || ''], (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      
      db.query('UPDATE orders SET dispatched = dispatched + ? WHERE id = ?', [quantity, order_id], (err) => {
        if (err) console.error('Failed to update order dispatch count:', err);
      });

      res.json({ id: results.insertId, order_id, dispatch_date, quantity, reference_no });
    });
  });
});

app.get('/api/test', (req, res) => {
  res.json({ message: 'Node.js backend with MySQL is running!' });
});

// Setup Nodemailer Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

function sendOverdueEmails() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.OWNER_EMAIL) return;
  
  db.query('SELECT * FROM orders', (err, results) => {
    if (err || !results) return;
    
    let overdueList = results.filter(o => {
        let pending = o.quantity - o.dispatched;
        if (pending <= 0) return false;
        let daysPassed = Math.round((new Date() - new Date(o.order_date)) / 86400000);
        return daysPassed > 30;
    });
    
    console.log('Checked for overdue orders. Found:', overdueList.length);
    if (overdueList.length === 0) return;
    
    let emailContent = 'The following orders are pending for more than 30 days:\n\n';
    overdueList.forEach(o => {
      let pending = o.quantity - o.dispatched;
      emailContent += `Order: ${o.order_number} | Party: ${o.party} | Pending: ${pending} | Date: ${o.order_date.toISOString().split('T')[0]}\n`;
    });
    emailContent += '\nLog in to the Order Desk to take action.';
    
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.OWNER_EMAIL,
      subject: 'Daily Alert: Overdue Orders (>30 Days)',
      text: emailContent
    };
    
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) console.error('Error sending email:', error);
      else console.log('Overdue email sent:', info.response);
    });
  });
}

// Simple interval instead of node-cron (for Node v6 compatibility)
const ONE_HOUR = 60 * 60 * 1000;
setInterval(() => {
  console.log('Running hourly overdue check...');
  sendOverdueEmails();
}, ONE_HOUR);

// Test API endpoint to trigger email immediately
app.post('/api/test-email', (req, res) => {
  sendOverdueEmails();
  res.json({ message: 'Email check triggered!' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
