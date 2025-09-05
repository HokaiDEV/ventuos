const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de acesso necessário' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key_here');
    
    // Verificar se o usuário ainda existe e está ativo
    const [users] = await pool.execute(
      'SELECT id, nome, email, perfil, ativo FROM usuarios WHERE id = ? AND ativo = 1',
      [decoded.userId]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Usuário não encontrado ou inativo' });
    }

    req.user = users[0];
    next();
  } catch (error) {
    console.error('Erro na autenticação:', error);
    return res.status(403).json({ error: 'Token inválido' });
  }
};

const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    if (!roles.includes(req.user.perfil)) {
      return res.status(403).json({ error: 'Permissão insuficiente' });
    }

    next();
  };
};

const logAuditoria = async (usuarioId, acao, tabelaAfetada, registroId, detalhes = null) => {
  try {
    await pool.execute(
      'INSERT INTO auditoria (usuario_id, acao, tabela_afetada, registro_id, detalhes) VALUES (?, ?, ?, ?, ?)',
      [usuarioId, acao, tabelaAfetada, registroId, JSON.stringify(detalhes)]
    );
  } catch (error) {
    console.error('Erro ao registrar auditoria:', error);
  }
};

module.exports = {
  authenticateToken,
  requireRole,
  logAuditoria
};