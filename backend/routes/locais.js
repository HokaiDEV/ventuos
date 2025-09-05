const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, requireRole, logAuditoria } = require('../middleware/auth');

const router = express.Router();

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);

// Listar locais de estoque
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = '';
    const params = [];
    
    if (search) {
      whereClause = 'WHERE nome LIKE ? OR codigo LIKE ? OR endereco LIKE ?';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    const query = `
      SELECT * FROM locais_estoque 
      ${whereClause}
      ORDER BY nome
      LIMIT ? OFFSET ?
    `;
    
    params.push(parseInt(limit), offset);
    
    const [locais] = await pool.execute(query, params);
    
    // Contar total
    const countQuery = `SELECT COUNT(*) as total FROM locais_estoque ${whereClause}`;
    const [countResult] = await pool.execute(countQuery, params.slice(0, -2));
    const total = countResult[0].total;
    
    res.json({
      locais,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Erro ao listar locais:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Buscar local por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [locais] = await pool.execute(
      'SELECT * FROM locais_estoque WHERE id = ?',
      [id]
    );
    
    if (locais.length === 0) {
      return res.status(404).json({ error: 'Local não encontrado' });
    }
    
    res.json(locais[0]);
    
  } catch (error) {
    console.error('Erro ao buscar local:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Criar local de estoque
router.post('/', requireRole(['admin', 'usuario']), async (req, res) => {
  try {
    const { codigo, nome, endereco, responsavel } = req.body;
    
    if (!nome) {
      return res.status(400).json({ error: 'Nome é obrigatório' });
    }
    
    // Verificar se código já existe
    if (codigo) {
      const [existing] = await pool.execute(
        'SELECT id FROM locais_estoque WHERE codigo = ?',
        [codigo]
      );
      
      if (existing.length > 0) {
        return res.status(400).json({ error: 'Código já existe' });
      }
    }
    
    const [result] = await pool.execute(`
      INSERT INTO locais_estoque (codigo, nome, endereco, responsavel)
      VALUES (?, ?, ?, ?)
    `, [codigo, nome, endereco, responsavel]);
    
    const localId = result.insertId;
    
    await logAuditoria(req.user.id, 'CRIACAO_LOCAL', 'locais_estoque', localId, {
      codigo, nome, endereco
    });
    
    res.status(201).json({
      id: localId,
      message: 'Local criado com sucesso'
    });
    
  } catch (error) {
    console.error('Erro ao criar local:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Atualizar local de estoque
router.put('/:id', requireRole(['admin', 'usuario']), async (req, res) => {
  try {
    const { id } = req.params;
    const { codigo, nome, endereco, responsavel } = req.body;
    
    const [existing] = await pool.execute(
      'SELECT * FROM locais_estoque WHERE id = ?',
      [id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Local não encontrado' });
    }
    
    // Verificar se código já existe em outro local
    if (codigo && codigo !== existing[0].codigo) {
      const [duplicate] = await pool.execute(
        'SELECT id FROM locais_estoque WHERE codigo = ? AND id != ?',
        [codigo, id]
      );
      
      if (duplicate.length > 0) {
        return res.status(400).json({ error: 'Código já existe' });
      }
    }
    
    await pool.execute(`
      UPDATE locais_estoque SET
        codigo = COALESCE(?, codigo),
        nome = COALESCE(?, nome),
        endereco = COALESCE(?, endereco),
        responsavel = COALESCE(?, responsavel)
      WHERE id = ?
    `, [codigo, nome, endereco, responsavel, id]);
    
    await logAuditoria(req.user.id, 'ATUALIZACAO_LOCAL', 'locais_estoque', id, {
      codigo, nome, endereco
    });
    
    res.json({ message: 'Local atualizado com sucesso' });
    
  } catch (error) {
    console.error('Erro ao atualizar local:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Deletar local de estoque
router.delete('/:id', requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const [existing] = await pool.execute(
      'SELECT * FROM locais_estoque WHERE id = ?',
      [id]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Local não encontrado' });
    }
    
    // Verificar se há estoques associados
    const [estoques] = await pool.execute(
      'SELECT COUNT(*) as count FROM estoques WHERE local_id = ?',
      [id]
    );
    
    if (estoques[0].count > 0) {
      return res.status(400).json({ 
        error: 'Não é possível excluir local com estoques associados' 
      });
    }
    
    // Verificar se há transferências associadas
    const [transferencias] = await pool.execute(
      'SELECT COUNT(*) as count FROM transferencias WHERE origem_local_id = ? OR destino_local_id = ?',
      [id, id]
    );
    
    if (transferencias[0].count > 0) {
      return res.status(400).json({ 
        error: 'Não é possível excluir local com transferências associadas' 
      });
    }
    
    await pool.execute('DELETE FROM locais_estoque WHERE id = ?', [id]);
    
    await logAuditoria(req.user.id, 'EXCLUSAO_LOCAL', 'locais_estoque', id);
    
    res.json({ message: 'Local excluído com sucesso' });
    
  } catch (error) {
    console.error('Erro ao excluir local:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;