const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);

// Listar auditoria
router.get('/', requireRole(['admin']), async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      search = '', 
      acao = '', 
      tabelaAfetada = '',
      dataInicio = '',
      dataFim = '',
      usuarioId = ''
    } = req.query;
    
    const offset = (page - 1) * limit;
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    if (search) {
      whereClause += ' AND (a.acao LIKE ? OR a.tabela_afetada LIKE ? OR u.nome LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    
    if (acao) {
      whereClause += ' AND a.acao = ?';
      params.push(acao);
    }
    
    if (tabelaAfetada) {
      whereClause += ' AND a.tabela_afetada = ?';
      params.push(tabelaAfetada);
    }
    
    if (usuarioId) {
      whereClause += ' AND a.usuario_id = ?';
      params.push(usuarioId);
    }
    
    if (dataInicio) {
      whereClause += ' AND DATE(a.created_at) >= ?';
      params.push(dataInicio);
    }
    
    if (dataFim) {
      whereClause += ' AND DATE(a.created_at) <= ?';
      params.push(dataFim);
    }
    
    const query = `
      SELECT 
        a.*,
        u.nome as usuario_nome,
        u.email as usuario_email
      FROM auditoria a
      LEFT JOIN usuarios u ON a.usuario_id = u.id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT ? OFFSET ?
    `;
    
    params.push(parseInt(limit), offset);
    
    const [auditoria] = await pool.execute(query, params);
    
    // Contar total
    const countQuery = `
      SELECT COUNT(*) as total
      FROM auditoria a
      LEFT JOIN usuarios u ON a.usuario_id = u.id
      ${whereClause}
    `;
    const [countResult] = await pool.execute(countQuery, params.slice(0, -2));
    const total = countResult[0].total;
    
    res.json({
      auditoria,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Erro ao listar auditoria:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Buscar auditoria por ID
router.get('/:id', requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    const [auditoria] = await pool.execute(`
      SELECT 
        a.*,
        u.nome as usuario_nome,
        u.email as usuario_email
      FROM auditoria a
      LEFT JOIN usuarios u ON a.usuario_id = u.id
      WHERE a.id = ?
    `, [id]);
    
    if (auditoria.length === 0) {
      return res.status(404).json({ error: 'Registro de auditoria não encontrado' });
    }
    
    res.json(auditoria[0]);
    
  } catch (error) {
    console.error('Erro ao buscar auditoria:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Relatório de auditoria por período
router.get('/relatorio/periodo', requireRole(['admin']), async (req, res) => {
  try {
    const { dataInicio, dataFim, acao, tabelaAfetada } = req.query;
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    if (dataInicio) {
      whereClause += ' AND DATE(a.created_at) >= ?';
      params.push(dataInicio);
    }
    
    if (dataFim) {
      whereClause += ' AND DATE(a.created_at) <= ?';
      params.push(dataFim);
    }
    
    if (acao) {
      whereClause += ' AND a.acao = ?';
      params.push(acao);
    }
    
    if (tabelaAfetada) {
      whereClause += ' AND a.tabela_afetada = ?';
      params.push(tabelaAfetada);
    }
    
    const query = `
      SELECT 
        a.acao,
        a.tabela_afetada,
        COUNT(*) as total_acoes,
        COUNT(DISTINCT a.usuario_id) as usuarios_unicos,
        MIN(a.created_at) as primeira_acao,
        MAX(a.created_at) as ultima_acao
      FROM auditoria a
      ${whereClause}
      GROUP BY a.acao, a.tabela_afetada
      ORDER BY total_acoes DESC
    `;
    
    const [relatorio] = await pool.execute(query, params);
    
    res.json(relatorio);
    
  } catch (error) {
    console.error('Erro ao gerar relatório de auditoria:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Relatório de auditoria por usuário
router.get('/relatorio/usuario/:usuarioId', requireRole(['admin']), async (req, res) => {
  try {
    const { usuarioId } = req.params;
    const { dataInicio, dataFim } = req.query;
    
    let whereClause = 'WHERE a.usuario_id = ?';
    const params = [usuarioId];
    
    if (dataInicio) {
      whereClause += ' AND DATE(a.created_at) >= ?';
      params.push(dataInicio);
    }
    
    if (dataFim) {
      whereClause += ' AND DATE(a.created_at) <= ?';
      params.push(dataFim);
    }
    
    const query = `
      SELECT 
        a.acao,
        a.tabela_afetada,
        COUNT(*) as total_acoes,
        MIN(a.created_at) as primeira_acao,
        MAX(a.created_at) as ultima_acao
      FROM auditoria a
      ${whereClause}
      GROUP BY a.acao, a.tabela_afetada
      ORDER BY total_acoes DESC
    `;
    
    const [relatorio] = await pool.execute(query, params);
    
    res.json(relatorio);
    
  } catch (error) {
    console.error('Erro ao gerar relatório de auditoria por usuário:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Exportar auditoria para CSV
router.get('/export/csv', requireRole(['admin']), async (req, res) => {
  try {
    const { dataInicio, dataFim, acao, tabelaAfetada } = req.query;
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    if (dataInicio) {
      whereClause += ' AND DATE(a.created_at) >= ?';
      params.push(dataInicio);
    }
    
    if (dataFim) {
      whereClause += ' AND DATE(a.created_at) <= ?';
      params.push(dataFim);
    }
    
    if (acao) {
      whereClause += ' AND a.acao = ?';
      params.push(acao);
    }
    
    if (tabelaAfetada) {
      whereClause += ' AND a.tabela_afetada = ?';
      params.push(tabelaAfetada);
    }
    
    const query = `
      SELECT 
        a.id,
        a.acao,
        a.tabela_afetada,
        a.registro_id,
        u.nome as usuario_nome,
        u.email as usuario_email,
        a.created_at,
        a.detalhes
      FROM auditoria a
      LEFT JOIN usuarios u ON a.usuario_id = u.id
      ${whereClause}
      ORDER BY a.created_at DESC
    `;
    
    const [auditoria] = await pool.execute(query, params);
    
    // Gerar CSV
    let csv = 'ID,Ação,Tabela,Registro ID,Usuário,Email,Data,Detalhes\n';
    
    auditoria.forEach(registro => {
      csv += `${registro.id},"${registro.acao}","${registro.tabela_afetada || ''}",${registro.registro_id || ''},"${registro.usuario_nome || ''}","${registro.usuario_email || ''}","${registro.created_at}","${registro.detalhes || ''}"\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=auditoria.csv');
    res.send(csv);
    
  } catch (error) {
    console.error('Erro ao exportar auditoria:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Limpar auditoria antiga (manter apenas últimos 6 meses)
router.delete('/limpar', requireRole(['admin']), async (req, res) => {
  try {
    const [result] = await pool.execute(
      'DELETE FROM auditoria WHERE created_at < DATE_SUB(NOW(), INTERVAL 6 MONTH)'
    );
    
    res.json({ 
      message: `${result.affectedRows} registros de auditoria antigos foram removidos`,
      registrosRemovidos: result.affectedRows
    });
    
  } catch (error) {
    console.error('Erro ao limpar auditoria:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

module.exports = router;