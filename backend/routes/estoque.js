const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, requireRole, logAuditoria } = require('../middleware/auth');

const router = express.Router();

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);

// Listar estoques por local
router.get('/local/:localId', async (req, res) => {
  try {
    const { localId } = req.params;
    const { page = 1, limit = 20, search = '' } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE e.local_id = ?';
    const params = [localId];
    
    if (search) {
      whereClause += ' AND (p.descricao LIKE ? OR p.codigo LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    
    const query = `
      SELECT 
        e.*,
        p.codigo as produto_codigo,
        p.descricao as produto_descricao,
        p.unidade as produto_unidade,
        l.nome as local_nome
      FROM estoques e
      JOIN produtos p ON e.produto_id = p.id
      JOIN locais_estoque l ON e.local_id = l.id
      ${whereClause}
      ORDER BY p.descricao
      LIMIT ? OFFSET ?
    `;
    
    params.push(parseInt(limit), offset);
    
    const [estoques] = await pool.execute(query, params);
    
    // Contar total
    const countQuery = `
      SELECT COUNT(*) as total
      FROM estoques e
      JOIN produtos p ON e.produto_id = p.id
      ${whereClause}
    `;
    const [countResult] = await pool.execute(countQuery, params.slice(0, -2));
    const total = countResult[0].total;
    
    res.json({
      estoques,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Erro ao listar estoques:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Buscar estoque por produto e local
router.get('/produto/:produtoId/local/:localId', async (req, res) => {
  try {
    const { produtoId, localId } = req.params;
    
    const [estoques] = await pool.execute(`
      SELECT 
        e.*,
        p.codigo as produto_codigo,
        p.descricao as produto_descricao,
        p.unidade as produto_unidade,
        l.nome as local_nome
      FROM estoques e
      JOIN produtos p ON e.produto_id = p.id
      JOIN locais_estoque l ON e.local_id = l.id
      WHERE e.produto_id = ? AND e.local_id = ?
    `, [produtoId, localId]);
    
    if (estoques.length === 0) {
      return res.status(404).json({ error: 'Estoque não encontrado' });
    }
    
    res.json(estoques[0]);
    
  } catch (error) {
    console.error('Erro ao buscar estoque:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Atualizar quantidade de estoque
router.put('/produto/:produtoId/local/:localId', requireRole(['admin', 'usuario']), async (req, res) => {
  try {
    const { produtoId, localId } = req.params;
    const { quantidade } = req.body;
    
    if (quantidade < 0) {
      return res.status(400).json({ error: 'Quantidade não pode ser negativa' });
    }
    
    // Verificar se estoque existe
    const [existing] = await pool.execute(
      'SELECT * FROM estoques WHERE produto_id = ? AND local_id = ?',
      [produtoId, localId]
    );
    
    if (existing.length === 0) {
      // Criar novo estoque
      await pool.execute(
        'INSERT INTO estoques (produto_id, local_id, quantidade) VALUES (?, ?, ?)',
        [produtoId, localId, quantidade]
      );
    } else {
      // Atualizar estoque existente
      await pool.execute(
        'UPDATE estoques SET quantidade = ? WHERE produto_id = ? AND local_id = ?',
        [quantidade, produtoId, localId]
      );
    }
    
    // Atualizar estoque atual do produto
    const [totalEstoque] = await pool.execute(
      'SELECT SUM(quantidade) as total FROM estoques WHERE produto_id = ?',
      [produtoId]
    );
    
    await pool.execute(
      'UPDATE produtos SET estoque_atual = ? WHERE id = ?',
      [totalEstoque[0].total || 0, produtoId]
    );
    
    await logAuditoria(req.user.id, 'ATUALIZACAO_ESTOQUE', 'estoques', null, {
      produto_id: produtoId,
      local_id: localId,
      quantidade
    });
    
    res.json({ message: 'Estoque atualizado com sucesso' });
    
  } catch (error) {
    console.error('Erro ao atualizar estoque:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Ajustar estoque (entrada/saída)
router.post('/ajuste', requireRole(['admin', 'usuario']), async (req, res) => {
  try {
    const { produtoId, localId, quantidade, tipo, observacao } = req.body;
    
    if (!produtoId || !localId || quantidade === undefined) {
      return res.status(400).json({ error: 'Produto, local e quantidade são obrigatórios' });
    }
    
    if (quantidade === 0) {
      return res.status(400).json({ error: 'Quantidade deve ser diferente de zero' });
    }
    
    // Verificar se estoque existe
    const [existing] = await pool.execute(
      'SELECT * FROM estoques WHERE produto_id = ? AND local_id = ?',
      [produtoId, localId]
    );
    
    let novaQuantidade = 0;
    if (existing.length > 0) {
      novaQuantidade = existing[0].quantidade + quantidade;
    } else {
      novaQuantidade = quantidade;
    }
    
    if (novaQuantidade < 0) {
      return res.status(400).json({ error: 'Quantidade insuficiente em estoque' });
    }
    
    // Atualizar ou criar estoque
    if (existing.length > 0) {
      await pool.execute(
        'UPDATE estoques SET quantidade = ? WHERE produto_id = ? AND local_id = ?',
        [novaQuantidade, produtoId, localId]
      );
    } else {
      await pool.execute(
        'INSERT INTO estoques (produto_id, local_id, quantidade) VALUES (?, ?, ?)',
        [produtoId, localId, novaQuantidade]
      );
    }
    
    // Atualizar estoque atual do produto
    const [totalEstoque] = await pool.execute(
      'SELECT SUM(quantidade) as total FROM estoques WHERE produto_id = ?',
      [produtoId]
    );
    
    await pool.execute(
      'UPDATE produtos SET estoque_atual = ? WHERE id = ?',
      [totalEstoque[0].total || 0, produtoId]
    );
    
    // Registrar movimentação
    await pool.execute(`
      INSERT INTO movimentacoes (produto_id, tipo, quantidade, usuario_id, referencia)
      VALUES (?, ?, ?, ?, ?)
    `, [produtoId, tipo, quantidade, req.user.id, observacao]);
    
    await logAuditoria(req.user.id, 'AJUSTE_ESTOQUE', 'estoques', null, {
      produto_id: produtoId,
      local_id: localId,
      quantidade,
      tipo,
      observacao
    });
    
    res.json({ message: 'Ajuste de estoque realizado com sucesso' });
    
  } catch (error) {
    console.error('Erro ao ajustar estoque:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Relatório de estoque por local
router.get('/relatorio/local/:localId', async (req, res) => {
  try {
    const { localId } = req.params;
    
    const [relatorio] = await pool.execute(`
      SELECT 
        l.nome as local_nome,
        COUNT(e.id) as total_produtos,
        SUM(e.quantidade) as total_quantidade,
        SUM(e.quantidade * COALESCE(p.preco_medio, 0)) as valor_total
      FROM locais_estoque l
      LEFT JOIN estoques e ON l.id = e.local_id
      LEFT JOIN produtos p ON e.produto_id = p.id
      WHERE l.id = ?
      GROUP BY l.id, l.nome
    `, [localId]);
    
    res.json(relatorio[0] || {});
    
  } catch (error) {
    console.error('Erro ao gerar relatório de estoque:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;