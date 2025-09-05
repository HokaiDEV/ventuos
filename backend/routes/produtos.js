const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, requireRole, logAuditoria } = require('../middleware/auth');

const router = express.Router();

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);

// Listar produtos com filtros
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search = '', 
      grupo_id = '', 
      ativo = '' 
    } = req.query;

    const offset = (page - 1) * limit;
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (search) {
      whereClause += ' AND (p.descricao LIKE ? OR p.codigo LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (grupo_id) {
      whereClause += ' AND p.grupo_id = ?';
      params.push(grupo_id);
    }

    if (ativo !== '') {
      whereClause += ' AND p.ativo = ?';
      params.push(ativo === 'true' ? 1 : 0);
    }

    // Query principal
    const query = `
      SELECT 
        p.*,
        g.nome as grupo_nome,
        g.codigo as grupo_codigo
      FROM produtos p
      LEFT JOIN grupos g ON p.grupo_id = g.id
      ${whereClause}
      ORDER BY p.descricao
      LIMIT ? OFFSET ?
    `;

    params.push(parseInt(limit), offset);

    const [produtos] = await pool.execute(query, params);

    // Contar total para paginação
    const countQuery = `
      SELECT COUNT(*) as total
      FROM produtos p
      LEFT JOIN grupos g ON p.grupo_id = g.id
      ${whereClause}
    `;

    const [countResult] = await pool.execute(countQuery, params.slice(0, -2));
    const total = countResult[0].total;

    res.json({
      produtos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Erro ao listar produtos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Buscar produto por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [produtos] = await pool.execute(`
      SELECT 
        p.*,
        g.nome as grupo_nome,
        g.codigo as grupo_codigo
      FROM produtos p
      LEFT JOIN grupos g ON p.grupo_id = g.id
      WHERE p.id = ?
    `, [id]);

    if (produtos.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    res.json(produtos[0]);

  } catch (error) {
    console.error('Erro ao buscar produto:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Criar produto
router.post('/', requireRole(['admin', 'usuario']), async (req, res) => {
  try {
    const {
      codigo,
      descricao,
      unidade,
      grupo_id,
      estoque_minimo,
      estoque_maximo,
      estoque_requisitado
    } = req.body;

    // Validar campos obrigatórios
    if (!codigo || !descricao) {
      return res.status(400).json({ error: 'Código e descrição são obrigatórios' });
    }

    // Verificar se código já existe
    const [existing] = await pool.execute(
      'SELECT id FROM produtos WHERE codigo = ?',
      [codigo]
    );

    if (existing.length > 0) {
      return res.status(400).json({ error: 'Código já existe' });
    }

    // Inserir produto
    const [result] = await pool.execute(`
      INSERT INTO produtos (
        codigo, descricao, unidade, grupo_id, 
        estoque_minimo, estoque_maximo, estoque_requisitado
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      codigo, descricao, unidade, grupo_id || null,
      estoque_minimo || 0, estoque_maximo || 0, estoque_requisitado || 0
    ]);

    const produtoId = result.insertId;

    // Log de auditoria
    await logAuditoria(req.user.id, 'CRIACAO_PRODUTO', 'produtos', produtoId, {
      codigo, descricao, unidade, grupo_id
    });

    res.status(201).json({
      id: produtoId,
      message: 'Produto criado com sucesso'
    });

  } catch (error) {
    console.error('Erro ao criar produto:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Atualizar produto
router.put('/:id', requireRole(['admin', 'usuario']), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      codigo,
      descricao,
      unidade,
      grupo_id,
      estoque_minimo,
      estoque_maximo,
      estoque_requisitado,
      ativo
    } = req.body;

    // Verificar se produto existe
    const [existing] = await pool.execute(
      'SELECT * FROM produtos WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    // Verificar se código já existe em outro produto
    if (codigo && codigo !== existing[0].codigo) {
      const [duplicate] = await pool.execute(
        'SELECT id FROM produtos WHERE codigo = ? AND id != ?',
        [codigo, id]
      );

      if (duplicate.length > 0) {
        return res.status(400).json({ error: 'Código já existe' });
      }
    }

    // Atualizar produto
    await pool.execute(`
      UPDATE produtos SET
        codigo = COALESCE(?, codigo),
        descricao = COALESCE(?, descricao),
        unidade = COALESCE(?, unidade),
        grupo_id = COALESCE(?, grupo_id),
        estoque_minimo = COALESCE(?, estoque_minimo),
        estoque_maximo = COALESCE(?, estoque_maximo),
        estoque_requisitado = COALESCE(?, estoque_requisitado),
        ativo = COALESCE(?, ativo),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      codigo, descricao, unidade, grupo_id,
      estoque_minimo, estoque_maximo, estoque_requisitado, ativo, id
    ]);

    // Log de auditoria
    await logAuditoria(req.user.id, 'ATUALIZACAO_PRODUTO', 'produtos', id, {
      codigo, descricao, unidade, grupo_id, ativo
    });

    res.json({ message: 'Produto atualizado com sucesso' });

  } catch (error) {
    console.error('Erro ao atualizar produto:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Deletar produto (soft delete)
router.delete('/:id', requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se produto existe
    const [existing] = await pool.execute(
      'SELECT * FROM produtos WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    // Verificar se há movimentações
    const [movimentacoes] = await pool.execute(
      'SELECT COUNT(*) as count FROM movimentacoes WHERE produto_id = ?',
      [id]
    );

    if (movimentacoes[0].count > 0) {
      return res.status(400).json({ 
        error: 'Não é possível excluir produto com movimentações. Desative o produto.' 
      });
    }

    // Soft delete
    await pool.execute(
      'UPDATE produtos SET ativo = 0 WHERE id = ?',
      [id]
    );

    // Log de auditoria
    await logAuditoria(req.user.id, 'EXCLUSAO_PRODUTO', 'produtos', id);

    res.json({ message: 'Produto excluído com sucesso' });

  } catch (error) {
    console.error('Erro ao excluir produto:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Listar grupos
router.get('/grupos/list', async (req, res) => {
  try {
    const [grupos] = await pool.execute(
      'SELECT id, nome, codigo FROM grupos ORDER BY nome'
    );

    res.json(grupos);

  } catch (error) {
    console.error('Erro ao listar grupos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;