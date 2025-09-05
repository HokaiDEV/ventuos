const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, requireRole, logAuditoria } = require('../middleware/auth');

const router = express.Router();

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);

// Listar fornecedores
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = '';
    const params = [];
    
    if (search) {
      whereClause = 'WHERE nome LIKE ? OR cnpj_cpf LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }
    
    const query = `
      SELECT * FROM fornecedores 
      ${whereClause}
      ORDER BY nome
      LIMIT ? OFFSET ?
    `;
    
    params.push(parseInt(limit), offset);
    
    const [fornecedores] = await pool.execute(query, params);
    
    // Contar total
    const countQuery = `SELECT COUNT(*) as total FROM fornecedores ${whereClause}`;
    const [countResult] = await pool.execute(countQuery, params.slice(0, -2));
    const total = countResult[0].total;
    
    res.json({
      fornecedores,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Erro ao listar fornecedores:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Buscar fornecedor por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [fornecedores] = await pool.execute(
      'SELECT * FROM fornecedores WHERE id = ?',
      [id]
    );
    
    if (fornecedores.length === 0) {
      return res.status(404).json({ error: 'Fornecedor não encontrado' });
    }
    
    res.json(fornecedores[0]);
    
  } catch (error) {
    console.error('Erro ao buscar fornecedor:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Criar fornecedor
router.post('/', requireRole(['admin', 'usuario']), async (req, res) => {
  try {
    const { nome, cnpj_cpf, contato, telefone, email } = req.body;
    
    if (!nome) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }
    
    const [result] = await pool.execute(`
      INSERT INTO fornecedores (nome, cnpj_cpf, contato, telefone, email)
      VALUES (?, ?, ?, ?, ?)
    `, [nome, cnpj_cpf, contato, telefone, email]);
    
    const fornecedorId = result.insertId;
    
    await logAuditoria(req.user.id, 'CRIACAO_FORNECEDOR', 'fornecedores', fornecedorId, {
      nome, cnpj_cpf
    });
    
    res.status(201).json({
      id: fornecedorId,
      message: 'Fornecedor criado com sucesso'
    });
    
  } catch (error) {
    console.error('Erro ao criar fornecedor:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Atualizar fornecedor
router.put('/:id', requireRole(['admin', 'usuario']), async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, cnpj_cpf, contato, telefone, email } = req.body;
    
    const [existing] = await pool.execute(
      'SELECT * FROM fornecedores WHERE id = ?',
      [id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Fornecedor não encontrado' });
    }
    
    await pool.execute(`
      UPDATE fornecedores SET
        nome = COALESCE(?, nome),
        cnpj_cpf = COALESCE(?, cnpj_cpf),
        contato = COALESCE(?, contato),
        telefone = COALESCE(?, telefone),
        email = COALESCE(?, email)
      WHERE id = ?
    `, [nome, cnpj_cpf, contato, telefone, email, id]);
    
    await logAuditoria(req.user.id, 'ATUALIZACAO_FORNECEDOR', 'fornecedores', id, {
      nome, cnpj_cpf
    });
    
    res.json({ message: 'Fornecedor atualizado com sucesso' });
    
  } catch (error) {
    console.error('Erro ao atualizar fornecedor:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Deletar fornecedor
router.delete('/:id', requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const [existing] = await pool.execute(
      'SELECT * FROM fornecedores WHERE id = ?',
      [id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Fornecedor não encontrado' });
    }
    
    // Verificar se há entradas associadas
    const [entradas] = await pool.execute(
      'SELECT COUNT(*) as count FROM entradas WHERE fornecedor_id = ?',
      [id]
    );
    
    if (entradas[0].count > 0) {
      return res.status(400).json({ 
        error: 'Não é possível excluir fornecedor com entradas associadas' 
      });
    }
    
    await pool.execute('DELETE FROM fornecedores WHERE id = ?', [id]);
    
    await logAuditoria(req.user.id, 'EXCLUSAO_FORNECEDOR', 'fornecedores', id);
    
    res.json({ message: 'Fornecedor excluído com sucesso' });
    
  } catch (error) {
    console.error('Erro ao excluir fornecedor:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;