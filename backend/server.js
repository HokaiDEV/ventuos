const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Load menu data from CSV
function loadMenu() {
  const file = path.join(__dirname, 'data', 'menu.csv');
  const raw = fs.readFileSync(file, 'utf8');
  const lines = raw.trim().split('\n');
  const headers = lines.shift().split(',');
  return lines.map(line => {
    const parts = line.split(',');
    const item = {};
    headers.forEach((h, i) => {
      item[h] = parts[i];
    });
    item.price = parseFloat(item.price);
    return item;
  });
}

const menu = loadMenu();

app.get('/menu', (req, res) => {
  res.json(menu);
});

app.post('/auth/login', (req, res) => {
  // Placeholder authentication
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'email required' });
  }
  res.json({ token: 'dummy-token', email });
});

app.post('/orders', (req, res) => {
  // Placeholder order creation
  const order = req.body;
  order.id = Date.now();
  order.status = 'created';
  res.status(201).json(order);
});

app.listen(PORT, () => {
  console.log(`BOTEQUIM Delivery backend running on port ${PORT}`);
});
