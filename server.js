const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Garante fetch disponível mesmo em versões mais antigas do Node (<18)
if (typeof fetch === 'undefined') {
  global.fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
}

const app = express();
app.use(cors());
app.use(express.json());

const SECRET_KEY = process.env.JWT_SECRET || 'sua_chave_secreta_super_segura_2024';
const DB_PATH = process.env.DB_PATH || './livraria.db';

// Inicializar banco de dados
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('Erro ao conectar:', err);
  else console.log('✅ Banco de dados conectado');
});

// Criar tabelas se não existirem
function initializeDB() {
  db.serialize(() => {
    // Tabela de usuários
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      role TEXT DEFAULT 'atendente',
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabela de livros
    db.run(`CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY,
      isbn TEXT UNIQUE,
      title TEXT NOT NULL,
      author TEXT,
      category TEXT,
      quantity INTEGER DEFAULT 0,
      min_quantity INTEGER DEFAULT 5,
      unit_price REAL NOT NULL,
      cover_url TEXT,
      synopsis TEXT,
      publisher TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Migração leve: adiciona colunas novas se o banco já existir sem elas
    db.run(`ALTER TABLE books ADD COLUMN cover_url TEXT`, () => {});
    db.run(`ALTER TABLE books ADD COLUMN synopsis TEXT`, () => {});
    db.run(`ALTER TABLE books ADD COLUMN publisher TEXT`, () => {});

    // Tabela de movimentação de estoque
    db.run(`CREATE TABLE IF NOT EXISTS inventory_logs (
      id INTEGER PRIMARY KEY,
      book_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      reason TEXT,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(book_id) REFERENCES books(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Tabela de vendas
    db.run(`CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY,
      sale_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      total_amount REAL NOT NULL,
      user_id INTEGER NOT NULL,
      payment_method TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Tabela de itens de venda
    db.run(`CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY,
      sale_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      discount REAL DEFAULT 0,
      subtotal REAL NOT NULL,
      FOREIGN KEY(sale_id) REFERENCES sales(id),
      FOREIGN KEY(book_id) REFERENCES books(id)
    )`);

    // Tabela de caixa/fechamento
    db.run(`CREATE TABLE IF NOT EXISTS cash_registers (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      opening_balance REAL DEFAULT 0,
      total_sales REAL DEFAULT 0,
      total_expenses REAL DEFAULT 0,
      closing_balance REAL,
      opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      status TEXT DEFAULT 'open',
      notes TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Tabela de logs de auditoria
    db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      table_name TEXT,
      record_id INTEGER,
      old_value TEXT,
      new_value TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    console.log('✅ Tabelas criadas/verificadas');
  });
}

// Middleware de autenticação
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Token não fornecido' });

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    next();
  });
}

// Função para registrar logs de auditoria
function logAudit(userId, action, tableName, recordId, oldValue, newValue, ipAddress) {
  db.run(
    `INSERT INTO audit_logs (user_id, action, table_name, record_id, old_value, new_value, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, action, tableName, recordId, oldValue ? JSON.stringify(oldValue) : null, JSON.stringify(newValue), ipAddress]
  );
}

// ============= ROTAS DE AUTENTICAÇÃO =============

// Registro de novo usuário (apenas admin)
app.post('/api/auth/register', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas admin pode registrar usuários' });
  }

  const { username, password, name, email, role } = req.body;

  bcrypt.hash(password, 10, (err, hash) => {
    if (err) return res.status(500).json({ error: 'Erro ao criptografar senha' });

    db.run(
      `INSERT INTO users (username, password, name, email, role) VALUES (?, ?, ?, ?, ?)`,
      [username, hash, name, email, role || 'atendente'],
      function(err) {
        if (err) return res.status(400).json({ error: 'Usuário já existe' });
        logAudit(req.user.id, 'CRIAR_USUARIO', 'users', this.lastID, null, { username, name, role }, req.ip);
        res.json({ id: this.lastID, message: 'Usuário criado com sucesso' });
      }
    );
  });
});

// Login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  db.get(`SELECT * FROM users WHERE username = ? AND active = 1`, [username], (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'Usuário não encontrado' });

    bcrypt.compare(password, user.password, (err, isMatch) => {
      if (err || !isMatch) return res.status(401).json({ error: 'Senha incorreta' });

      const token = jwt.sign({ id: user.id, username: user.username, role: user.role, name: user.name }, SECRET_KEY, { expiresIn: '8h' });
      logAudit(user.id, 'LOGIN', 'users', user.id, null, { timestamp: new Date() }, req.ip);
      res.json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
    });
  });
});

// ============= ROTAS DE USUÁRIOS =============

// Listar todos os usuários (admin)
app.get('/api/users', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  db.all(`SELECT id, username, name, email, role, active, created_at FROM users`, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Atualizar usuário
app.put('/api/users/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { name, email, role, active } = req.body;
  db.run(
    `UPDATE users SET name = ?, email = ?, role = ?, active = ? WHERE id = ?`,
    [name, email, role, active, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit(req.user.id, 'ATUALIZAR_USUARIO', 'users', req.params.id, null, { name, email, role, active }, req.ip);
      res.json({ message: 'Usuário atualizado' });
    }
  );
});

// ============= BUSCA DE LIVROS NA INTERNET =============

// Busca livro por título/autor/ISBN no Google Books, com fallback no Open Library
app.get('/api/books-search/external', authenticateToken, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Informe um termo de busca' });

  try {
    const googleUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=8&country=BR`;
    const googleResp = await fetch(googleUrl);
    const googleData = await googleResp.json();

    let results = [];

    if (googleData.items && googleData.items.length > 0) {
      results = googleData.items.map(item => {
        const info = item.volumeInfo || {};
        const cover = info.imageLinks
          ? (info.imageLinks.thumbnail || info.imageLinks.smallThumbnail || '').replace('http://', 'https://')
          : null;

        const isbnInfo = (info.industryIdentifiers || []).find(i => i.type === 'ISBN_13')
          || (info.industryIdentifiers || []).find(i => i.type === 'ISBN_10');

        return {
          source: 'google_books',
          isbn: isbnInfo ? isbnInfo.identifier : null,
          title: info.title || '',
          author: (info.authors || []).join(', '),
          publisher: info.publisher || '',
          category: (info.categories || [])[0] || '',
          synopsis: info.description || '',
          cover_url: cover,
          year: info.publishedDate ? info.publishedDate.substring(0, 4) : ''
        };
      }).filter(b => b.title);
    }

    // Fallback: se Google Books não retornou nada, tenta Open Library
    if (results.length === 0) {
      const olUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=8`;
      const olResp = await fetch(olUrl);
      const olData = await olResp.json();

      results = (olData.docs || []).map(doc => ({
        source: 'open_library',
        isbn: (doc.isbn || [])[0] || null,
        title: doc.title || '',
        author: (doc.author_name || []).join(', '),
        publisher: (doc.publisher || [])[0] || '',
        category: (doc.subject || [])[0] || '',
        synopsis: '',
        cover_url: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null,
        year: doc.first_publish_year ? String(doc.first_publish_year) : ''
      })).filter(b => b.title);
    }

    res.json({ results });
  } catch (err) {
    console.error('Erro na busca externa:', err);
    res.status(500).json({ error: 'Erro ao buscar livro na internet' });
  }
});

// ============= ROTAS DE ESTOQUE =============

// Listar livros com busca rápida
app.get('/api/books', authenticateToken, (req, res) => {
  const search = req.query.search || '';
  const category = req.query.category || '';

  let query = `SELECT * FROM books WHERE 1=1`;
  const params = [];

  if (search) {
    query += ` AND (title LIKE ? OR author LIKE ? OR isbn LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (category) {
    query += ` AND category = ?`;
    params.push(category);
  }

  query += ` ORDER BY title ASC`;

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Obter um livro
app.get('/api/books/:id', authenticateToken, (req, res) => {
  db.get(`SELECT * FROM books WHERE id = ?`, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});

// Adicionar livro
app.post('/api/books', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'gerente') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { isbn, title, author, category, quantity, min_quantity, unit_price, cover_url, synopsis, publisher } = req.body;

  db.run(
    `INSERT INTO books (isbn, title, author, category, quantity, min_quantity, unit_price, cover_url, synopsis, publisher)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [isbn || null, title, author, category, quantity || 0, min_quantity || 5, unit_price, cover_url || null, synopsis || null, publisher || null],
    function(err) {
      if (err) return res.status(400).json({ error: 'Erro ao adicionar livro' });
      logAudit(req.user.id, 'CRIAR_LIVRO', 'books', this.lastID, null, { title, author, quantity }, req.ip);
      res.json({ id: this.lastID, message: 'Livro adicionado' });
    }
  );
});

// Atualizar livro
app.put('/api/books/:id', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'gerente') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const { title, author, category, unit_price, min_quantity, cover_url, synopsis, publisher } = req.body;

  db.run(
    `UPDATE books SET title = ?, author = ?, category = ?, unit_price = ?, min_quantity = ?, 
            cover_url = ?, synopsis = ?, publisher = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [title, author, category, unit_price, min_quantity, cover_url || null, synopsis || null, publisher || null, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit(req.user.id, 'ATUALIZAR_LIVRO', 'books', req.params.id, null, { title, author, unit_price }, req.ip);
      res.json({ message: 'Livro atualizado' });
    }
  );
});

// ============= ROTAS DE VENDAS =============

// Criar venda
app.post('/api/sales', authenticateToken, (req, res) => {
  const { items, payment_method, notes } = req.body;
  
  let totalAmount = 0;
  items.forEach(item => {
    totalAmount += (item.quantity * item.unit_price) - (item.discount || 0);
  });

  db.run(
    `INSERT INTO sales (total_amount, user_id, payment_method, notes)
     VALUES (?, ?, ?, ?)`,
    [totalAmount, req.user.id, payment_method, notes],
    function(saleId) {
      const insertedId = this.lastID;
      let completed = 0;

      items.forEach((item, index) => {
        const subtotal = (item.quantity * item.unit_price) - (item.discount || 0);
        
        db.run(
          `INSERT INTO sale_items (sale_id, book_id, quantity, unit_price, discount, subtotal)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [insertedId, item.book_id, item.quantity, item.unit_price, item.discount || 0, subtotal],
          function() {
            // Atualizar estoque
            db.run(
              `UPDATE books SET quantity = quantity - ? WHERE id = ?`,
              [item.quantity, item.book_id],
              function() {
                logAudit(req.user.id, 'VENDA_ITEM', 'books', item.book_id, null, { quantity: item.quantity }, req.ip);
                completed++;

                if (completed === items.length) {
                  logAudit(req.user.id, 'CRIAR_VENDA', 'sales', insertedId, null, { totalAmount, items: items.length }, req.ip);
                  res.json({ id: insertedId, totalAmount, message: 'Venda registrada' });
                }
              }
            );
          }
        );
      });
    }
  );
});

// Listar vendas
app.get('/api/sales', authenticateToken, (req, res) => {
  const date = req.query.date || '';
  let query = `SELECT s.*, u.name as user_name FROM sales s 
               JOIN users u ON s.user_id = u.id WHERE 1=1`;
  const params = [];

  if (date) {
    query += ` AND DATE(s.sale_date) = ?`;
    params.push(date);
  }

  query += ` ORDER BY s.created_at DESC LIMIT 100`;

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Obter detalhes da venda
app.get('/api/sales/:id', authenticateToken, (req, res) => {
  db.get(
    `SELECT s.*, u.name as user_name FROM sales s 
     JOIN users u ON s.user_id = u.id WHERE s.id = ?`,
    [req.params.id],
    (err, sale) => {
      if (err) return res.status(500).json({ error: err.message });
      
      db.all(
        `SELECT si.*, b.title FROM sale_items si
         JOIN books b ON si.book_id = b.id WHERE si.sale_id = ?`,
        [req.params.id],
        (err, items) => {
          if (err) return res.status(500).json({ error: err.message });
          res.json({ ...sale, items });
        }
      );
    }
  );
});

// ============= ROTAS DE CAIXA =============

// Abrir caixa
app.post('/api/cash-register/open', authenticateToken, (req, res) => {
  const { opening_balance } = req.body;

  db.run(
    `INSERT INTO cash_registers (user_id, opening_balance, status)
     VALUES (?, ?, 'open')`,
    [req.user.id, opening_balance || 0],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      logAudit(req.user.id, 'ABRIR_CAIXA', 'cash_registers', this.lastID, null, { opening_balance }, req.ip);
      res.json({ id: this.lastID, message: 'Caixa aberto' });
    }
  );
});

// Fechar caixa
app.put('/api/cash-register/:id/close', authenticateToken, (req, res) => {
  const { closing_balance, notes } = req.body;

  db.get(`SELECT * FROM cash_registers WHERE id = ?`, [req.params.id], (err, register) => {
    if (err) return res.status(500).json({ error: err.message });
    if (register.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    db.run(
      `UPDATE cash_registers 
       SET status = 'closed', closing_balance = ?, closed_at = CURRENT_TIMESTAMP, notes = ?
       WHERE id = ?`,
      [closing_balance, notes, req.params.id],
      function(err) {
        if (err) return res.status(500).json({ error: err.message });
        logAudit(req.user.id, 'FECHAR_CAIXA', 'cash_registers', req.params.id, null, { closing_balance }, req.ip);
        res.json({ message: 'Caixa fechado' });
      }
    );
  });
});

// Obter caixa aberto do usuário
app.get('/api/cash-register/open/:userId', authenticateToken, (req, res) => {
  db.get(
    `SELECT * FROM cash_registers WHERE user_id = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1`,
    [req.params.userId],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(row || null);
    }
  );
});

// ============= ROTAS DE LOGS E AUDITORIA =============

// Obter logs de auditoria
app.get('/api/audit-logs', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'gerente') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const user_id = req.query.user_id || '';
  const action = req.query.action || '';
  const days = req.query.days || 7;

  let query = `SELECT al.*, u.name as user_name FROM audit_logs al
               JOIN users u ON al.user_id = u.id 
               WHERE al.created_at >= datetime('now', '-' || ? || ' days')`;
  const params = [days];

  if (user_id) {
    query += ` AND al.user_id = ?`;
    params.push(user_id);
  }

  if (action) {
    query += ` AND al.action = ?`;
    params.push(action);
  }

  query += ` ORDER BY al.created_at DESC LIMIT 500`;

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Relatório de vendas por usuário
app.get('/api/reports/sales-by-user', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'gerente') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const days = req.query.days || 7;

  db.all(
    `SELECT u.name, COUNT(s.id) as total_sales, SUM(s.total_amount) as total_amount
     FROM sales s
     JOIN users u ON s.user_id = u.id
     WHERE s.created_at >= datetime('now', '-' || ? || ' days')
     GROUP BY s.user_id
     ORDER BY total_amount DESC`,
    [days],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Relatório de estoque
app.get('/api/reports/inventory', authenticateToken, (req, res) => {
  db.all(
    `SELECT id, title, author, category, quantity, min_quantity, unit_price, 
            (quantity * unit_price) as total_value
     FROM books
     ORDER BY category, title`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Relatório de movimentação de estoque
app.get('/api/reports/inventory-movements', authenticateToken, (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'gerente') {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  const days = req.query.days || 30;

  db.all(
    `SELECT il.*, b.title, u.name as user_name
     FROM inventory_logs il
     JOIN books b ON il.book_id = b.id
     JOIN users u ON il.user_id = u.id
     WHERE il.created_at >= datetime('now', '-' || ? || ' days')
     ORDER BY il.created_at DESC`,
    [days],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// ============= ROTAS DE DASHBOARD =============

app.get('/api/dashboard/summary', authenticateToken, (req, res) => {
  const days = req.query.days || 7;

  Promise.all([
    new Promise((resolve) => {
      db.get(
        `SELECT COUNT(*) as count FROM books`,
        (err, row) => resolve(row || { count: 0 })
      );
    }),
    new Promise((resolve) => {
      db.get(
        `SELECT SUM(quantity) as total FROM books`,
        (err, row) => resolve(row || { total: 0 })
      );
    }),
    new Promise((resolve) => {
      db.get(
        `SELECT COUNT(*) as count, SUM(total_amount) as total FROM sales
         WHERE created_at >= datetime('now', '-' || ? || ' days')`,
        [days],
        (err, row) => resolve(row || { count: 0, total: 0 })
      );
    }),
    new Promise((resolve) => {
      db.get(
        `SELECT SUM(quantity * unit_price) as total FROM books`,
        (err, row) => resolve(row || { total: 0 })
      );
    })
  ]).then(([books, inventory, sales, value]) => {
    res.json({
      totalBooks: books.count,
      totalInventory: inventory.total || 0,
      totalSales: sales.count,
      totalRevenue: sales.total || 0,
      inventoryValue: value.total || 0,
      period: `${days} dias`
    });
  });
});

// Inicializar
initializeDB();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
