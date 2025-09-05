const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const produtoRoutes = require('./routes/produtos');
const fornecedorRoutes = require('./routes/fornecedores');
const colaboradorRoutes = require('./routes/colaboradores');
const localRoutes = require('./routes/locais');
const estoqueRoutes = require('./routes/estoque');
const movimentacaoRoutes = require('./routes/movimentacoes');
const emprestimoRoutes = require('./routes/emprestimos');
const transferenciaRoutes = require('./routes/transferencias');
const relatorioRoutes = require('./routes/relatorios');
const auditoriaRoutes = require('./routes/auditoria');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware de segurança
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requests por IP
  message: 'Muitas tentativas de acesso. Tente novamente em 15 minutos.'
});
app.use('/api/', limiter);

// Middleware para parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Middleware de logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Rotas da API
app.use('/api/auth', authRoutes);
app.use('/api/produtos', produtoRoutes);
app.use('/api/fornecedores', fornecedorRoutes);
app.use('/api/colaboradores', colaboradorRoutes);
app.use('/api/locais', localRoutes);
app.use('/api/estoque', estoqueRoutes);
app.use('/api/movimentacoes', movimentacaoRoutes);
app.use('/api/emprestimos', emprestimoRoutes);
app.use('/api/transferencias', transferenciaRoutes);
app.use('/api/relatorios', relatorioRoutes);
app.use('/api/auditoria', auditoriaRoutes);

// Rota de health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Middleware de tratamento de erros
app.use((err, req, res, next) => {
  console.error('Erro:', err);
  res.status(500).json({ 
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Erro interno'
  });
});

// Rota 404
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
});