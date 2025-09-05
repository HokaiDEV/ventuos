const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const flash = require('connect-flash');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"]
        }
    }
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Muitas tentativas. Tente novamente em 15 minutos.'
});
app.use(limiter);

// CORS configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000'],
    credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Method override middleware
const methodOverride = require('./middleware/methodOverride');
app.use(methodOverride);

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'almoxarifado-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

app.use(flash());

// Static files
app.use(express.static('public'));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Database connection
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'almoxarifado',
    charset: 'utf8mb4',
    timezone: '+00:00'
};

let db;

async function connectDB() {
    try {
        db = await mysql.createConnection(dbConfig);
        console.log('✅ Conectado ao banco de dados MySQL');
        
        // Test connection
        await db.execute('SELECT 1');
        
        // Set current user for audit triggers
        await db.execute('SET @current_user_id = ?', [1]);
        
    } catch (error) {
        console.error('❌ Erro ao conectar com o banco de dados:', error.message);
        process.exit(1);
    }
}

// Global middleware to make db available in routes
app.use((req, res, next) => {
    req.db = db;
    next();
});

// Authentication middleware
const authenticateToken = async (req, res, next) => {
    const token = req.session.token;
    
    if (!token) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Token de acesso requerido' });
        }
        return res.redirect('/login');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
        const [rows] = await db.execute(
            'SELECT id, nome, email, perfil FROM usuarios WHERE id = ? AND ativo = 1',
            [decoded.userId]
        );

        if (rows.length === 0) {
            req.session.destroy();
            return res.redirect('/login');
        }

        req.user = rows[0];
        res.locals.user = req.user;
        next();
    } catch (error) {
        console.error('Erro na autenticação:', error);
        req.session.destroy();
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Token inválido' });
        }
        return res.redirect('/login');
    }
};

// Routes
app.get('/', (req, res) => {
    if (req.session.token) {
        return res.redirect('/dashboard');
    }
    res.redirect('/login');
});

app.get('/login', (req, res) => {
    if (req.session.token) {
        return res.redirect('/dashboard');
    }
    res.render('login', { 
        error: req.flash('error'),
        success: req.flash('success')
    });
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            req.flash('error', 'Email e senha são obrigatórios');
            return res.redirect('/login');
        }

        const [rows] = await db.execute(
            'SELECT id, nome, email, senha_hash, perfil, tentativas_login, bloqueado_ate FROM usuarios WHERE email = ? AND ativo = 1',
            [email]
        );

        if (rows.length === 0) {
            req.flash('error', 'Credenciais inválidas');
            return res.redirect('/login');
        }

        const user = rows[0];

        // Check if user is blocked
        if (user.bloqueado_ate && new Date() < new Date(user.bloqueado_ate)) {
            req.flash('error', 'Usuário temporariamente bloqueado. Tente novamente mais tarde.');
            return res.redirect('/login');
        }

        const isValidPassword = await bcrypt.compare(password, user.senha_hash);

        if (!isValidPassword) {
            // Increment failed attempts
            const tentativas = user.tentativas_login + 1;
            let bloqueado_ate = null;
            
            if (tentativas >= 5) {
                bloqueado_ate = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
            }

            await db.execute(
                'UPDATE usuarios SET tentativas_login = ?, bloqueado_ate = ? WHERE id = ?',
                [tentativas, bloqueado_ate, user.id]
            );

            req.flash('error', 'Credenciais inválidas');
            return res.redirect('/login');
        }

        // Reset failed attempts on successful login
        await db.execute(
            'UPDATE usuarios SET tentativas_login = 0, bloqueado_ate = NULL, ultimo_login = NOW() WHERE id = ?',
            [user.id]
        );

        // Create JWT token
        const token = jwt.sign(
            { userId: user.id, email: user.email, perfil: user.perfil },
            process.env.JWT_SECRET || 'default-secret',
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );

        req.session.token = token;
        req.session.user = {
            id: user.id,
            nome: user.nome,
            email: user.email,
            perfil: user.perfil
        };

        res.redirect('/dashboard');
    } catch (error) {
        console.error('Erro no login:', error);
        req.flash('error', 'Erro interno do servidor');
        res.redirect('/login');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Erro ao fazer logout:', err);
        }
        res.redirect('/login');
    });
});

app.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        // Get dashboard statistics
        const [produtosCount] = await db.execute('SELECT COUNT(*) as total FROM produtos WHERE ativo = 1');
        const [estoquesBaixos] = await db.execute(`
            SELECT COUNT(*) as total FROM produtos 
            WHERE ativo = 1 AND estoque_atual <= estoque_minimo AND estoque_minimo > 0
        `);
        const [emprestimosAbertos] = await db.execute(`
            SELECT COUNT(*) as total FROM emprestimos 
            WHERE status IN ('aberto', 'parcialmente_devolvido', 'atrasado')
        `);
        const [transferenciasPendentes] = await db.execute(`
            SELECT COUNT(*) as total FROM transferencias 
            WHERE status IN ('pendente', 'aprovada', 'em_transito')
        `);

        // Recent movements
        const [movimentosRecentes] = await db.execute(`
            SELECT m.*, p.descricao as produto_nome, u.nome as usuario_nome
            FROM movimentacoes m
            JOIN produtos p ON m.produto_id = p.id
            LEFT JOIN usuarios u ON m.usuario_id = u.id
            ORDER BY m.data_movimentacao DESC
            LIMIT 10
        `);

        res.render('dashboard', {
            stats: {
                produtos: produtosCount[0].total,
                estoquesBaixos: estoquesBaixos[0].total,
                emprestimosAbertos: emprestimosAbertos[0].total,
                transferenciasPendentes: transferenciasPendentes[0].total
            },
            movimentosRecentes,
            user: req.user
        });
    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
        req.flash('error', 'Erro ao carregar dashboard');
        res.redirect('/');
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Import route modules
const produtosRoutes = require('./routes/produtos');
const estoqueRoutes = require('./routes/estoque');
const transferenciasRoutes = require('./routes/transferencias');
const emprestimosRoutes = require('./routes/emprestimos');
const relatoriosRoutes = require('./routes/relatorios');

// Use routes
app.use('/produtos', authenticateToken, produtosRoutes);
app.use('/estoque', authenticateToken, estoqueRoutes);
app.use('/transferencias', authenticateToken, transferenciasRoutes);
app.use('/emprestimos', authenticateToken, emprestimosRoutes);
app.use('/relatorios', authenticateToken, relatoriosRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).render('404', { user: req.user });
});

// Error handler
app.use((error, req, res, next) => {
    console.error('Erro não tratado:', error);
    res.status(500).render('500', { 
        error: process.env.NODE_ENV === 'development' ? error : null,
        user: req.user 
    });
});

// Start server
async function startServer() {
    try {
        await connectDB();
        
        app.listen(PORT, () => {
            console.log(`🚀 Servidor rodando na porta ${PORT}`);
            console.log(`📱 Acesse: http://localhost:${PORT}`);
            console.log(`🏢 Sistema de Almoxarifado - LAJES TAMOYO`);
            console.log(`👨‍💻 Desenvolvido por: Master Vital Soluções`);
        });
    } catch (error) {
        console.error('❌ Erro ao iniciar servidor:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 Recebido SIGTERM, encerrando servidor...');
    if (db) {
        await db.end();
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 Recebido SIGINT, encerrando servidor...');
    if (db) {
        await db.end();
    }
    process.exit(0);
});

startServer();