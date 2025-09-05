const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { authenticateToken, logAuditoria } = require('../middleware/auth');

const router = express.Router();

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    // Buscar usuário
    const [users] = await pool.execute(
      'SELECT id, nome, email, senha_hash, perfil, ativo FROM usuarios WHERE email = ?',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const user = users[0];

    if (!user.ativo) {
      return res.status(401).json({ error: 'Usuário inativo' });
    }

    // Verificar senha
    const senhaValida = await bcrypt.compare(senha, user.senha_hash);
    if (!senhaValida) {
      await logAuditoria(user.id, 'TENTATIVA_LOGIN_INVALIDA', 'usuarios', user.id, { email });
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Gerar token JWT
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        perfil: user.perfil 
      },
      process.env.JWT_SECRET || 'your_jwt_secret_key_here',
      { expiresIn: '8h' }
    );

    // Log de auditoria
    await logAuditoria(user.id, 'LOGIN', 'usuarios', user.id, { email });

    res.json({
      token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        perfil: user.perfil
      }
    });

  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Verificar token
router.get('/verify', authenticateToken, (req, res) => {
  res.json({
    valid: true,
    user: req.user
  });
});

// Logout
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    await logAuditoria(req.user.id, 'LOGOUT', 'usuarios', req.user.id);
    res.json({ message: 'Logout realizado com sucesso' });
  } catch (error) {
    console.error('Erro no logout:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Alterar senha
router.put('/change-password', authenticateToken, async (req, res) => {
  try {
    const { senhaAtual, novaSenha } = req.body;

    if (!senhaAtual || !novaSenha) {
      return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
    }

    if (novaSenha.length < 6) {
      return res.status(400).json({ error: 'Nova senha deve ter pelo menos 6 caracteres' });
    }

    // Buscar senha atual
    const [users] = await pool.execute(
      'SELECT senha_hash FROM usuarios WHERE id = ?',
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Verificar senha atual
    const senhaValida = await bcrypt.compare(senhaAtual, users[0].senha_hash);
    if (!senhaValida) {
      return res.status(400).json({ error: 'Senha atual incorreta' });
    }

    // Criptografar nova senha
    const novaSenhaHash = await bcrypt.hash(novaSenha, 10);

    // Atualizar senha
    await pool.execute(
      'UPDATE usuarios SET senha_hash = ? WHERE id = ?',
      [novaSenhaHash, req.user.id]
    );

    await logAuditoria(req.user.id, 'ALTERACAO_SENHA', 'usuarios', req.user.id);

    res.json({ message: 'Senha alterada com sucesso' });

  } catch (error) {
    console.error('Erro ao alterar senha:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;