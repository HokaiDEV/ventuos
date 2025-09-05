const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, requireRole, logAuditoria } = require('../middleware/auth');

const router = express.Router();

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);

// Listar movimentações
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search = '', 
      tipo = '', 
      dataInicio = '', 
      dataFim = '',
      produtoId = ''
    } = req.query;
    
    const offset = (page - 1) * limit;
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    if (search) {
      whereClause += ' AND (p.descricao LIKE ? OR p.codigo LIKE ? OR m.referencia LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    if (tipo) {
      whereClause += ' AND m.tipo = ?';
      params.push(tipo);
    }
    
    if (produtoId) {
      whereClause += ' AND m.produto_id = ?';
      params.push(produtoId);
    }
    
    if (dataInicio) {
      whereClause += ' AND DATE(m.data_movimentacao) >= ?';
      params.push(dataInicio);
    }
    
    if (dataFim) {
      whereClause += ' AND DATE(m.data_movimentacao) <= ?';
      params.push(dataFim);
    }
    
    const query = `
      SELECT 
        m.*,
        p.codigo as produto_codigo,
        p.descricao as produto_descricao,
        p.unidade as produto_unidade,
        u.nome as usuario_nome
      FROM movimentacoes m
      JOIN produtos p ON m.produto_id = p.id
      LEFT JOIN usuarios u ON m.usuario_id = u.id
      ${whereClause}
      ORDER BY m.data_movimentacao DESC
      LIMIT ? OFFSET ?
    `;
    
    params.push(parseInt(limit), offset);
    
    const [movimentacoes] = await pool.execute(query, params);
    
    // Contar total
    const countQuery = `
      SELECT COUNT(*) as total
      FROM movimentacoes m
      JOIN produtos p ON m.produto_id = p.id
      ${whereClause}
    `;
    const [countResult] = await pool.execute(countQuery, params.slice(0, -2));
    const total = countResult[0].total;
    
    res.json({
      movimentacoes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Erro ao listar movimentações:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Buscar movimentação por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [movimentacoes] = await pool.execute(`
      SELECT 
        m.*,
        p.codigo as produto_codigo,
        p.descricao as produto_descricao,
        p.unidade as produto_unidade,
        u.nome as usuario_nome
      FROM movimentacoes m
      JOIN produtos p ON m.produto_id = p.id
      LEFT JOIN usuarios u ON m.usuario_id = u.id
      WHERE m.id = ?
    `, [id]);
    
    if (movimentacoes.length === 0) {
      return res.status(404).json({ error: 'Movimentação não encontrada' });
    }
    
    res.json(movimentacoes[0]);
    
  } catch (error) {
    console.error('Erro ao buscar movimentação:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Criar movimentação manual
router.post('/', requireRole(['admin', 'usuario']), async (req, res) => {
  try {
    const { produtoId, tipo, quantidade, referencia } = req.body;
    
    if (!produtoId || !tipo || !quantidade) {
      return res.status(400).json({ error: 'Produto, tipo e quantidade são obrigatórios' });
    }
    
    if (quantidade === 0) {
      return res.status(400).json({ error: 'Quantidade deve ser diferente de zero' });
    }
    
    // Verificar se produto existe
    const [produtos] = await pool.execute(
      'SELECT * FROM produtos WHERE id = ?',
      [produtoId]
    );
    
    if (produtos.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    
    // Registrar movimentação
    const [result] = await pool.execute(`
      INSERT INTO movimentacoes (produto_id, tipo, quantidade, usuario_id, referencia)
      VALUES (?, ?, ?, ?, ?)
    `, [produtoId, tipo, quantidade, req.user.id, referencia]);
    
    const movimentacaoId = result.insertId;
    
    await logAuditoria(req.user.id, 'CRIACAO_MOVIMENTACAO', 'movimentacoes', movimentacaoId, {
      produto_id: produtoId,
      tipo,
      quantidade,
      referencia
    });
    
    res.status(201).json({
      id: movimentacaoId,
      message: 'Movimentação criada com sucesso'
    });
    
  } catch (error) {
    console.error('Erro ao criar movimentação:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Relatório de movimentações
router.get('/relatorio/periodo', async (req, res) => {
  try {
    const { dataInicio, dataFim, tipo } = req.query;
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    if (dataInicio) {
      whereClause += ' AND DATE(m.data_movimentacao) >= ?';
      params.push(dataInicio);
    }
    
    if (dataFim) {
      whereClause += ' AND DATE(m.data_movimentacao) <= ?';
      params.push(dataFim);
    }
    
    if (tipo) {
      whereClause += ' AND m.tipo = ?';
      params.push(tipo);
    }
    
    const query = `
      SELECT 
        m.tipo,
        COUNT(*) as total_movimentacoes,
        SUM(ABS(m.quantidade)) as total_quantidade,
        COUNT(DISTINCT m.produto_id) as produtos_afetados
      FROM movimentacoes m
      ${whereClause}
      GROUP BY m.tipo
      ORDER BY total_movimentacoes DESC
    `;
    
    const [relatorio] = await pool.execute(query, params);
    
    res.json(relatorio);
    
  } catch (error) {
    console.error('Erro ao gerar relatório de movimentações:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Relatório de movimentações por produto
router.get('/relatorio/produto/:produtoId', async (req, res) => {
  try {
    const { produtoId } = req.params;
    const { dataInicio, dataFim } = req.query;
    
    let whereClause = 'WHERE m.produto_id = ?';
    const params = [produtoId];
    
    if (dataInicio) {
      whereClause += ' AND DATE(m.data_movimentacao) >= ?';
      params.push(dataInicio);
    }
    
    if (dataFim) {
      whereClause += ' AND DATE(m.data_movimentacao) <= ?';
      params.push(dataFim);
    }
    
    const query = `
      SELECT 
        p.codigo as produto_codigo,
        p.descricao as produto_descricao,
        m.tipo,
        COUNT(*) as total_movimentacoes,
        SUM(CASE WHEN m.quantidade > 0 THEN m.quantidade ELSE 0 END) as total_entradas,
        SUM(CASE WHEN m.quantidade < 0 THEN ABS(m.quantidade) ELSE 0 END) as total_saidas,
        SUM(m.quantidade) as saldo_periodo
      FROM movimentacoes m
      JOIN produtos p ON m.produto_id = p.id
      ${whereClause}
      GROUP BY p.id, p.codigo, p.descricao, m.tipo
      ORDER BY m.tipo
    `;
    
    const [relatorio] = await pool.execute(query, params);
    
    res.json(relatorio);
    
  } catch (error) {
    console.error('Erro ao gerar relatório de movimentações por produto:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Exportar movimentações para CSV
router.get('/export/csv', async (req, res) => {
  try {
    const { dataInicio, dataFim, tipo } = req.query;
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    if (dataInicio) {
      whereClause += ' AND DATE(m.data_movimentacao) >= ?';
      params.push(dataInicio);
    }
    
    if (dataFim) {
      whereClause += ' AND DATE(m.data_movimentacao) <= ?';
      params.push(dataFim);
    }
    
    if (tipo) {
      whereClause += ' AND m.tipo = ?';
      params.push(tipo);
    }
    
    const query = `
      SELECT 
        m.id,
        p.codigo as produto_codigo,
        p.descricao as produto_descricao,
        m.tipo,
        m.quantidade,
        m.data_movimentacao,
        u.nome as usuario_nome,
        m.referencia
      FROM movimentacoes m
      JOIN produtos p ON m.produto_id = p.id
      LEFT JOIN usuarios u ON m.usuario_id = u.id
      ${whereClause}
      ORDER BY m.data_movimentacao DESC
    `;
    
    const [movimentacoes] = await pool.execute(query, params);
    
    // Gerar CSV
    let csv = 'ID,Produto Código,Produto Descrição,Tipo,Quantidade,Data,Usuário,Referência\n';
    
    movimentacoes.forEach(mov => {
      csv += `${mov.id},"${mov.produto_codigo}","${mov.produto_descricao}","${mov.tipo}",${mov.quantidade},"${mov.data_movimentacao}","${mov.usuario_nome || ''}","${mov.referencia || ''}"\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=movimentacoes.csv');
    res.send(csv);
    
  } catch (error) {
    console.error('Erro ao exportar movimentações:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;