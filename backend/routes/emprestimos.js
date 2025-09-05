const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, requireRole, logAuditoria } = require('../middleware/auth');

const router = express.Router();

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);

// Listar empréstimos
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search = '', 
      status = '', 
      colaboradorId = '',
      dataInicio = '',
      dataFim = ''
    } = req.query;
    
    const offset = (page - 1) * limit;
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    if (search) {
      whereClause += ' AND (c.nome LIKE ? OR c.matricula LIKE ? OR e.observacao LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    if (status) {
      whereClause += ' AND e.status = ?';
      params.push(status);
    }
    
    if (colaboradorId) {
      whereClause += ' AND e.colaborador_id = ?';
      params.push(colaboradorId);
    }
    
    if (dataInicio) {
      whereClause += ' AND DATE(e.data_emprestimo) >= ?';
      params.push(dataInicio);
    }
    
    if (dataFim) {
      whereClause += ' AND DATE(e.data_emprestimo) <= ?';
      params.push(dataFim);
    }
    
    const query = `
      SELECT 
        e.*,
        c.nome as colaborador_nome,
        c.matricula as colaborador_matricula,
        c.setor as colaborador_setor,
        u.nome as usuario_nome
      FROM emprestimos e
      JOIN colaboradores c ON e.colaborador_id = c.id
      LEFT JOIN usuarios u ON e.usuario_solicitante = u.id
      ${whereClause}
      ORDER BY e.data_emprestimo DESC
      LIMIT ? OFFSET ?
    `;
    
    params.push(parseInt(limit), offset);
    
    const [emprestimos] = await pool.execute(query, params);
    
    // Buscar itens de cada empréstimo
    for (let emprestimo of emprestimos) {
      const [itens] = await pool.execute(`
        SELECT 
          ei.*,
          p.codigo as produto_codigo,
          p.descricao as produto_descricao,
          p.unidade as produto_unidade
        FROM emprestimo_itens ei
        JOIN produtos p ON ei.produto_id = p.id
        WHERE ei.emprestimo_id = ?
      `, [emprestimo.id]);
      
      emprestimo.itens = itens;
    }
    
    // Contar total
    const countQuery = `
      SELECT COUNT(*) as total
      FROM emprestimos e
      JOIN colaboradores c ON e.colaborador_id = c.id
      ${whereClause}
    `;
    const [countResult] = await pool.execute(countQuery, params.slice(0, -2));
    const total = countResult[0].total;
    
    res.json({
      emprestimos,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Erro ao listar empréstimos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Buscar empréstimo por ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const [emprestimos] = await pool.execute(`
      SELECT 
        e.*,
        c.nome as colaborador_nome,
        c.matricula as colaborador_matricula,
        c.setor as colaborador_setor,
        u.nome as usuario_nome
      FROM emprestimos e
      JOIN colaboradores c ON e.colaborador_id = c.id
      LEFT JOIN usuarios u ON e.usuario_solicitante = u.id
      WHERE e.id = ?
    `, [id]);
    
    if (emprestimos.length === 0) {
      return res.status(404).json({ error: 'Empréstimo não encontrado' });
    }
    
    const emprestimo = emprestimos[0];
    
    // Buscar itens do empréstimo
    const [itens] = await pool.execute(`
      SELECT 
        ei.*,
        p.codigo as produto_codigo,
        p.descricao as produto_descricao,
        p.unidade as produto_unidade
      FROM emprestimo_itens ei
      JOIN produtos p ON ei.produto_id = p.id
      WHERE ei.emprestimo_id = ?
    `, [id]);
    
    emprestimo.itens = itens;
    
    res.json(emprestimo);
    
  } catch (error) {
    console.error('Erro ao buscar empréstimo:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Criar empréstimo
router.post('/', requireRole(['admin', 'usuario']), async (req, res) => {
  try {
    const { colaboradorId, prazoDevolucao, observacao, itens } = req.body;
    
    if (!colaboradorId || !itens || itens.length === 0) {
      return res.status(400).json({ error: 'Colaborador e itens são obrigatórios' });
    }
    
    // Verificar se colaborador existe
    const [colaboradores] = await pool.execute(
      'SELECT * FROM colaboradores WHERE id = ?',
      [colaboradorId]
    );
    
    if (colaboradores.length === 0) {
      return res.status(404).json({ error: 'Colaborador não encontrado' });
    }
    
    // Verificar se produtos existem e têm estoque suficiente
    for (let item of itens) {
      const [produtos] = await pool.execute(
        'SELECT * FROM produtos WHERE id = ? AND ativo = 1',
        [item.produto_id]
      );
      
      if (produtos.length === 0) {
        return res.status(400).json({ error: `Produto ID ${item.produto_id} não encontrado ou inativo` });
      }
      
      if (produtos[0].estoque_atual < item.quantidade) {
        return res.status(400).json({ 
          error: `Estoque insuficiente para o produto ${produtos[0].descricao}` 
        });
      }
    }
    
    // Criar empréstimo
    const [result] = await pool.execute(`
      INSERT INTO emprestimos (colaborador_id, usuario_solicitante, prazo_devolucao, observacao)
      VALUES (?, ?, ?, ?)
    `, [colaboradorId, req.user.id, prazoDevolucao, observacao]);
    
    const emprestimoId = result.insertId;
    
    // Criar itens do empréstimo e baixar estoque
    for (let item of itens) {
      // Inserir item do empréstimo
      await pool.execute(`
        INSERT INTO emprestimo_itens (emprestimo_id, produto_id, quantidade)
        VALUES (?, ?, ?)
      `, [emprestimoId, item.produto_id, item.quantidade]);
      
      // Baixar estoque
      await pool.execute(`
        UPDATE produtos SET estoque_atual = estoque_atual - ? WHERE id = ?
      `, [item.quantidade, item.produto_id]);
      
      // Registrar movimentação
      await pool.execute(`
        INSERT INTO movimentacoes (produto_id, tipo, quantidade, usuario_id, referencia)
        VALUES (?, 'emprestimo_saida', ?, ?, ?)
      `, [item.produto_id, item.quantidade, req.user.id, `Empréstimo #${emprestimoId}`]);
    }
    
    await logAuditoria(req.user.id, 'CRIACAO_EMPRESTIMO', 'emprestimos', emprestimoId, {
      colaborador_id: colaboradorId,
      prazo_devolucao: prazoDevolucao,
      itens: itens.length
    });
    
    res.status(201).json({
      id: emprestimoId,
      message: 'Empréstimo criado com sucesso'
    });
    
  } catch (error) {
    console.error('Erro ao criar empréstimo:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Devolver empréstimo
router.put('/:id/devolver', requireRole(['admin', 'usuario']), async (req, res) => {
  try {
    const { id } = req.params;
    const { itensDevolvidos } = req.body;
    
    // Buscar empréstimo
    const [emprestimos] = await pool.execute(
      'SELECT * FROM emprestimos WHERE id = ? AND status = "aberto"',
      [id]
    );
    
    if (emprestimos.length === 0) {
      return res.status(404).json({ error: 'Empréstimo não encontrado ou já devolvido' });
    }
    
    const emprestimo = emprestimos[0];
    
    // Buscar itens do empréstimo
    const [itens] = await pool.execute(`
      SELECT * FROM emprestimo_itens WHERE emprestimo_id = ?
    `, [id]);
    
    // Processar devoluções
    let totalDevolvido = 0;
    let todosDevolvidos = true;
    
    for (let item of itens) {
      const devolvido = itensDevolvidos.find(d => d.item_id === item.id);
      const qtdDevolvida = devolvido ? devolvido.quantidade : 0;
      
      if (qtdDevolvida > 0) {
        // Atualizar quantidade devolvida
        await pool.execute(`
          UPDATE emprestimo_itens 
          SET qtd_retornada = qtd_retornada + ? 
          WHERE id = ?
        `, [qtdDevolvida, item.id]);
        
        // Restaurar estoque
        await pool.execute(`
          UPDATE produtos SET estoque_atual = estoque_atual + ? WHERE id = ?
        `, [qtdDevolvida, item.produto_id]);
        
        // Registrar movimentação
        await pool.execute(`
          INSERT INTO movimentacoes (produto_id, tipo, quantidade, usuario_id, referencia)
          VALUES (?, 'emprestimo_retorno', ?, ?, ?)
        `, [item.produto_id, qtdDevolvida, req.user.id, `Devolução Empréstimo #${id}`]);
        
        totalDevolvido += qtdDevolvida;
      }
      
      // Verificar se item foi totalmente devolvido
      const [itemAtualizado] = await pool.execute(
        'SELECT * FROM emprestimo_itens WHERE id = ?',
        [item.id]
      );
      
      if (itemAtualizado[0].qtd_retornada < item.quantidade) {
        todosDevolvidos = false;
      }
    }
    
    // Atualizar status do empréstimo
    const novoStatus = todosDevolvidos ? 'devolvido' : 'aberto';
    await pool.execute(`
      UPDATE emprestimos 
      SET status = ?, data_devolucao = ? 
      WHERE id = ?
    `, [novoStatus, todosDevolvidos ? new Date() : null, id]);
    
    await logAuditoria(req.user.id, 'DEVOLUCAO_EMPRESTIMO', 'emprestimos', id, {
      total_devolvido: totalDevolvido,
      status_final: novoStatus
    });
    
    res.json({ 
      message: `Devolução realizada com sucesso. ${totalDevolvido} itens devolvidos.`,
      status: novoStatus
    });
    
  } catch (error) {
    console.error('Erro ao devolver empréstimo:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Marcar empréstimo como perdido
router.put('/:id/perdido', requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { observacao } = req.body;
    
    // Buscar empréstimo
    const [emprestimos] = await pool.execute(
      'SELECT * FROM emprestimos WHERE id = ? AND status = "aberto"',
      [id]
    );
    
    if (emprestimos.length === 0) {
      return res.status(404).json({ error: 'Empréstimo não encontrado ou já finalizado' });
    }
    
    // Atualizar status
    await pool.execute(`
      UPDATE emprestimos 
      SET status = 'perdido', observacao = CONCAT(COALESCE(observacao, ''), '\n', ?)
      WHERE id = ?
    `, [observacao || 'Marcado como perdido', id]);
    
    await logAuditoria(req.user.id, 'EMPRESTIMO_PERDIDO', 'emprestimos', id, {
      observacao
    });
    
    res.json({ message: 'Empréstimo marcado como perdido' });
    
  } catch (error) {
    console.error('Erro ao marcar empréstimo como perdido:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Relatório de empréstimos
router.get('/relatorio/periodo', async (req, res) => {
  try {
    const { dataInicio, dataFim, status } = req.query;
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    if (dataInicio) {
      whereClause += ' AND DATE(e.data_emprestimo) >= ?';
      params.push(dataInicio);
    }
    
    if (dataFim) {
      whereClause += ' AND DATE(e.data_emprestimo) <= ?';
      params.push(dataFim);
    }
    
    if (status) {
      whereClause += ' AND e.status = ?';
      params.push(status);
    }
    
    const query = `
      SELECT 
        e.status,
        COUNT(*) as total_emprestimos,
        COUNT(DISTINCT e.colaborador_id) as colaboradores_unicos,
        SUM(ei.quantidade) as total_itens_emprestados,
        SUM(ei.qtd_retornada) as total_itens_devolvidos
      FROM emprestimos e
      JOIN emprestimo_itens ei ON e.id = ei.emprestimo_id
      ${whereClause}
      GROUP BY e.status
      ORDER BY total_emprestimos DESC
    `;
    
    const [relatorio] = await pool.execute(query, params);
    
    res.json(relatorio);
    
  } catch (error) {
    console.error('Erro ao gerar relatório de empréstimos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;