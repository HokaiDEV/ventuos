const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, requireRole, logAuditoria } = require('../middleware/auth');

const router = express.Router();

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);

// Listar colaboradores
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = '';
    const params = [];
    
    if (search) {
      whereClause = 'WHERE nome LIKE ? OR matricula LIKE ? OR setor LIKE ?';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    const query = `
      SELECT * FROM colaboradores 
      ${whereClause}
      ORDER BY nome
      LIMIT ? OFFSET ?
    `;
    
    params.push(parseInt(limit), offset);
    
    const [colaboradores] = await pool.execute(query, params);
    
    // Contar total
    const countQuery = `SELECT COUNT(*) as total FROM colaboradores ${whereClause}`;
    const [countResult] = await pool.execute(countQuery, params.slice(0, -2));
    const total = countResult[0].total;
    
    res.json({
      colaboradores,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Erro ao listar colaboradores:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Buscar colaborador por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [colaboradores] = await pool.execute(
      'SELECT * FROM colaboradores WHERE id = ?',
      [id]
    );
    
    if (colaboradores.length === 0) {
      return res.status(404).json({ error: 'Colaborador não encontrado' });
    }
    
    res.json(colaboradores[0]);
    
  } catch (error) {
    console.error('Erro ao buscar colaborador:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Criar colaborador
router.post('/', requireRole(['admin', 'usuario']), async (req, res) => {
  try {
    const { nome, matricula, setor, gestor } = req.body;
    
    if (!nome) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }
    
    // Verificar se matrícula já existe
    if (matricula) {
      const [existing] = await pool.execute(
        'SELECT id FROM colaboradores WHERE matricula = ?',
        [matricula]
      );
      
      if (existing.length > 0) {
        return res.status(400).json({ error: 'Matrícula já existe' });
      }
    }
    
    const [result] = await pool.execute(`
      INSERT INTO colaboradores (nome, matricula, setor, gestor)
      VALUES (?, ?, ?, ?)
    `, [nome, matricula, setor, gestor]);
    
    const colaboradorId = result.insertId;
    
    await logAuditoria(req.user.id, 'CRIACAO_COLABORADOR', 'colaboradores', colaboradorId, {
      nome, matricula, setor
    });
    
    res.status(201).json({
      id: colaboradorId,
      message: 'Colaborador criado com sucesso'
    });
    
  } catch (error) {
    console.error('Erro ao criar colaborador:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Atualizar colaborador
router.put('/:id', requireRole(['admin', 'usuario']), async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, matricula, setor, gestor } = req.body;
    
    const [existing] = await pool.execute(
      'SELECT * FROM colaboradores WHERE id = ?',
      [id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Colaborador não encontrado' });
    }
    
    // Verificar se matrícula já existe em outro colaborador
    if (matricula && matricula !== existing[0].matricula) {
      const [duplicate] = await pool.execute(
        'SELECT id FROM colaboradores WHERE matricula = ? AND id != ?',
        [matricula, id]
      );
      
      if (duplicate.length > 0) {
        return res.status(400).json({ error: 'Matrícula já existe' });
      }
    }
    
    await pool.execute(`
      UPDATE colaboradores SET
        nome = COALESCE(?, nome),
        matricula = COALESCE(?, matricula),
        setor = COALESCE(?, setor),
        gestor = COALESCE(?, gestor)
      WHERE id = ?
    `, [nome, matricula, setor, gestor, id]);
    
    await logAuditoria(req.user.id, 'ATUALIZACAO_COLABORADOR', 'colaboradores', id, {
      nome, matricula, setor
    });
    
    res.json({ message: 'Colaborador atualizado com sucesso' });
    
  } catch (error) {
    console.error('Erro ao atualizar colaborador:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Deletar colaborador
router.delete('/:id', requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const [existing] = await pool.execute(
      'SELECT * FROM colaboradores WHERE id = ?',
      [id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Colaborador não encontrado' });
    }
    
    // Verificar se há empréstimos associados
    const [emprestimos] = await pool.execute(
      'SELECT COUNT(*) as count FROM emprestimos WHERE colaborador_id = ?',
      [id]
    );
    
    if (emprestimos[0].count > 0) {
      return res.status(400).json({ 
        error: 'Não é possível excluir colaborador com empréstimos associados' 
      });
    }
    
    await pool.execute('DELETE FROM colaboradores WHERE id = ?', [id]);
    
    await logAuditoria(req.user.id, 'EXCLUSAO_COLABORADOR', 'colaboradores', id);
    
    res.json({ message: 'Colaborador excluído com sucesso' });
    
  } catch (error) {
    console.error('Erro ao excluir colaborador:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;