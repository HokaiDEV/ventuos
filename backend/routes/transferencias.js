const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, requireRole, logAuditoria } = require('../middleware/auth');

const router = express.Router();

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);

// Listar transferências
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search = '', 
      status = '', 
      origemId = '',
      destinoId = '',
      dataInicio = '',
      dataFim = ''
    } = req.query;
    
    const offset = (page - 1) * limit;
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    if (search) {
      whereClause += ' AND (t.observacao LIKE ? OR lo.nome LIKE ? OR ld.nome LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    if (status) {
      whereClause += ' AND t.status = ?';
      params.push(status);
    }
    
    if (origemId) {
      whereClause += ' AND t.origem_local_id = ?';
      params.push(origemId);
    }
    
    if (destinoId) {
      whereClause += ' AND t.destino_local_id = ?';
      params.push(destinoId);
    }
    
    if (dataInicio) {
      whereClause += ' AND DATE(t.data_solicitacao) >= ?';
      params.push(dataInicio);
    }
    
    if (dataFim) {
      whereClause += ' AND DATE(t.data_solicitacao) <= ?';
      params.push(dataFim);
    }
    
    const query = `
      SELECT 
        t.*,
        lo.nome as origem_nome,
        lo.codigo as origem_codigo,
        ld.nome as destino_nome,
        ld.codigo as destino_codigo
      FROM transferencias t
      JOIN locais_estoque lo ON t.origem_local_id = lo.id
      JOIN locais_estoque ld ON t.destino_local_id = ld.id
      ${whereClause}
      ORDER BY t.data_solicitacao DESC
      LIMIT ? OFFSET ?
    `;
    
    params.push(parseInt(limit), offset);
    
    const [transferencias] = await pool.execute(query, params);
    
    // Contar total
    const countQuery = `
      SELECT COUNT(*) as total
      FROM transferencias t
      JOIN locais_estoque lo ON t.origem_local_id = lo.id
      JOIN locais_estoque ld ON t.destino_local_id = ld.id
      ${whereClause}
    `;
    const [countResult] = await pool.execute(countQuery, params.slice(0, -2));
    const total = countResult[0].total;
    
    res.json({
      transferencias,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Erro ao listar transferências:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Buscar transferência por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [transferencias] = await pool.execute(`
      SELECT 
        t.*,
        lo.nome as origem_nome,
        lo.codigo as origem_codigo,
        ld.nome as destino_nome,
        ld.codigo as destino_codigo
      FROM transferencias t
      JOIN locais_estoque lo ON t.origem_local_id = lo.id
      JOIN locais_estoque ld ON t.destino_local_id = ld.id
      WHERE t.id = ?
    `, [id]);
    
    if (transferencias.length === 0) {
      return res.status(404).json({ error: 'Transferência não encontrada' });
    }
    
    res.json(transferencias[0]);
    
  } catch (error) {
    console.error('Erro ao buscar transferência:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Criar transferência
router.post('/', requireRole(['admin', 'usuario']), async (req, res) => {
  try {
    const { origemLocalId, destinoLocalId, observacao, itens } = req.body;
    
    if (!origemLocalId || !destinoLocalId) {
      return res.status(400).json({ error: 'Local de origem e destino são obrigatórios' });
    }
    
    if (origemLocalId === destinoLocalId) {
      return res.status(400).json({ error: 'Local de origem e destino devem ser diferentes' });
    }
    
    if (!itens || itens.length === 0) {
      return res.status(400).json({ error: 'Pelo menos um item deve ser transferido' });
    }
    
    // Verificar se locais existem
    const [locais] = await pool.execute(
      'SELECT * FROM locais_estoque WHERE id IN (?, ?)',
      [origemLocalId, destinoLocalId]
    );
    
    if (locais.length !== 2) {
      return res.status(404).json({ error: 'Um ou ambos os locais não foram encontrados' });
    }
    
    // Verificar se produtos existem e têm estoque suficiente no local de origem
    for (let item of itens) {
      const [produtos] = await pool.execute(
        'SELECT * FROM produtos WHERE id = ? AND ativo = 1',
        [item.produto_id]
      );
      
      if (produtos.length === 0) {
        return res.status(400).json({ error: `Produto ID ${item.produto_id} não encontrado ou inativo` });
      }
      
      // Verificar estoque no local de origem
      const [estoqueOrigem] = await pool.execute(
        'SELECT quantidade FROM estoques WHERE produto_id = ? AND local_id = ?',
        [item.produto_id, origemLocalId]
      );
      
      const estoqueDisponivel = estoqueOrigem.length > 0 ? estoqueOrigem[0].quantidade : 0;
      
      if (estoqueDisponivel < item.quantidade) {
        return res.status(400).json({ 
          error: `Estoque insuficiente no local de origem para o produto ${produtos[0].descricao}` 
        });
      }
    }
    
    // Criar transferência
    const [result] = await pool.execute(`
      INSERT INTO transferencias (origem_local_id, destino_local_id, responsavel, observacao)
      VALUES (?, ?, ?, ?)
    `, [origemLocalId, destinoLocalId, req.user.nome, observacao]);
    
    const transferenciaId = result.insertId;
    
    // Processar itens da transferência
    for (let item of itens) {
      // Baixar estoque do local de origem
      await pool.execute(`
        UPDATE estoques 
        SET quantidade = quantidade - ? 
        WHERE produto_id = ? AND local_id = ?
      `, [item.quantidade, item.produto_id, origemLocalId]);
      
      // Adicionar estoque ao local de destino
      const [estoqueDestino] = await pool.execute(
        'SELECT * FROM estoques WHERE produto_id = ? AND local_id = ?',
        [item.produto_id, destinoLocalId]
      );
      
      if (estoqueDestino.length > 0) {
        await pool.execute(`
          UPDATE estoques 
          SET quantidade = quantidade + ? 
          WHERE produto_id = ? AND local_id = ?
        `, [item.quantidade, item.produto_id, destinoLocalId]);
      } else {
        await pool.execute(`
          INSERT INTO estoques (produto_id, local_id, quantidade)
          VALUES (?, ?, ?)
        `, [item.produto_id, destinoLocalId, item.quantidade]);
      }
      
      // Registrar movimentação
      await pool.execute(`
        INSERT INTO movimentacoes (produto_id, tipo, quantidade, usuario_id, referencia)
        VALUES (?, 'transferencia', ?, ?, ?)
      `, [item.produto_id, item.quantidade, req.user.id, `Transferência #${transferenciaId}`]);
    }
    
    // Atualizar estoque atual dos produtos
    for (let item of itens) {
      const [totalEstoque] = await pool.execute(
        'SELECT SUM(quantidade) as total FROM estoques WHERE produto_id = ?',
        [item.produto_id]
      );
      
      await pool.execute(
        'UPDATE produtos SET estoque_atual = ? WHERE id = ?',
        [totalEstoque[0].total || 0, item.produto_id]
      );
    }
    
    // Marcar transferência como concluída
    await pool.execute(`
      UPDATE transferencias 
      SET status = 'concluida', data_conclusao = NOW() 
      WHERE id = ?
    `, [transferenciaId]);
    
    await logAuditoria(req.user.id, 'CRIACAO_TRANSFERENCIA', 'transferencias', transferenciaId, {
      origem_local_id: origemLocalId,
      destino_local_id: destinoLocalId,
      itens: itens.length
    });
    
    res.status(201).json({
      id: transferenciaId,
      message: 'Transferência realizada com sucesso'
    });
    
  } catch (error) {
    console.error('Erro ao criar transferência:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Aprovar transferência
router.put('/:id/aprovar', requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const [transferencias] = await pool.execute(
      'SELECT * FROM transferencias WHERE id = ? AND status = "pendente"',
      [id]
    );
    
    if (transferencias.length === 0) {
      return res.status(404).json({ error: 'Transferência não encontrada ou já processada' });
    }
    
    await pool.execute(`
      UPDATE transferencias 
      SET status = 'em_transito' 
      WHERE id = ?
    `, [id]);
    
    await logAuditoria(req.user.id, 'APROVACAO_TRANSFERENCIA', 'transferencias', id);
    
    res.json({ message: 'Transferência aprovada com sucesso' });
    
  } catch (error) {
    console.error('Erro ao aprovar transferência:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Cancelar transferência
router.put('/:id/cancelar', requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    
    const [transferencias] = await pool.execute(
      'SELECT * FROM transferencias WHERE id = ? AND status IN ("pendente", "em_transito")',
      [id]
    );
    
    if (transferencias.length === 0) {
      return res.status(404).json({ error: 'Transferência não encontrada ou já finalizada' });
    }
    
    await pool.execute(`
      UPDATE transferencias 
      SET status = 'cancelada', observacao = CONCAT(COALESCE(observacao, ''), '\n', ?)
      WHERE id = ?
    `, [motivo || 'Transferência cancelada', id]);
    
    await logAuditoria(req.user.id, 'CANCELAMENTO_TRANSFERENCIA', 'transferencias', id, {
      motivo
    });
    
    res.json({ message: 'Transferência cancelada com sucesso' });
    
  } catch (error) {
    console.error('Erro ao cancelar transferência:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Relatório de transferências
router.get('/relatorio/periodo', async (req, res) => {
  try {
    const { dataInicio, dataFim, status } = req.query;
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    if (dataInicio) {
      whereClause += ' AND DATE(t.data_solicitacao) >= ?';
      params.push(dataInicio);
    }
    
    if (dataFim) {
      whereClause += ' AND DATE(t.data_solicitacao) <= ?';
      params.push(dataFim);
    }
    
    if (status) {
      whereClause += ' AND t.status = ?';
      params.push(status);
    }
    
    const query = `
      SELECT 
        t.status,
        COUNT(*) as total_transferencias,
        COUNT(DISTINCT t.origem_local_id) as locais_origem_unicos,
        COUNT(DISTINCT t.destino_local_id) as locais_destino_unicos
      FROM transferencias t
      ${whereClause}
      GROUP BY t.status
      ORDER BY total_transferencias DESC
    `;
    
    const [relatorio] = await pool.execute(query, params);
    
    res.json(relatorio);
    
  } catch (error) {
    console.error('Erro ao gerar relatório de transferências:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;