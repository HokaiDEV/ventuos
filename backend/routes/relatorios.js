const express = require('express');
const { pool } = require('../config/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');

const router = express.Router();

// Aplicar autenticação em todas as rotas
router.use(authenticateToken);

// Relatório de posição de estoque
router.get('/estoque/posicao', async (req, res) => {
  try {
    const { localId, grupoId, formato = 'json' } = req.query;
    
    let whereClause = 'WHERE p.ativo = 1';
    const params = [];
    
    if (localId) {
      whereClause += ' AND e.local_id = ?';
      params.push(localId);
    }
    
    if (grupoId) {
      whereClause += ' AND p.grupo_id = ?';
      params.push(grupoId);
    }
    
    const query = `
      SELECT 
        p.codigo,
        p.descricao,
        p.unidade,
        g.nome as grupo_nome,
        COALESCE(SUM(e.quantidade), 0) as estoque_atual,
        p.estoque_minimo,
        p.estoque_maximo,
        CASE 
          WHEN COALESCE(SUM(e.quantidade), 0) <= p.estoque_minimo THEN 'CRÍTICO'
          WHEN COALESCE(SUM(e.quantidade), 0) <= p.estoque_minimo * 1.5 THEN 'ATENÇÃO'
          ELSE 'NORMAL'
        END as status_estoque
      FROM produtos p
      LEFT JOIN grupos g ON p.grupo_id = g.id
      LEFT JOIN estoques e ON p.id = e.produto_id
      ${whereClause}
      GROUP BY p.id, p.codigo, p.descricao, p.unidade, g.nome, p.estoque_minimo, p.estoque_maximo
      ORDER BY p.descricao
    `;
    
    const [relatorio] = await pool.execute(query, params);
    
    if (formato === 'excel') {
      return exportToExcel(res, relatorio, 'posicao_estoque');
    } else if (formato === 'pdf') {
      return exportToPDF(res, relatorio, 'Posição de Estoque');
    }
    
    res.json(relatorio);
    
  } catch (error) {
    console.error('Erro ao gerar relatório de posição de estoque:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Relatório de rupturas
router.get('/estoque/rupturas', async (req, res) => {
  try {
    const { localId, formato = 'json' } = req.query;
    
    let whereClause = 'WHERE p.ativo = 1 AND COALESCE(SUM(e.quantidade), 0) <= p.estoque_minimo';
    const params = [];
    
    if (localId) {
      whereClause += ' AND e.local_id = ?';
      params.push(localId);
    }
    
    const query = `
      SELECT 
        p.codigo,
        p.descricao,
        p.unidade,
        g.nome as grupo_nome,
        COALESCE(SUM(e.quantidade), 0) as estoque_atual,
        p.estoque_minimo,
        p.estoque_maximo,
        (p.estoque_minimo - COALESCE(SUM(e.quantidade), 0)) as quantidade_faltante
      FROM produtos p
      LEFT JOIN grupos g ON p.grupo_id = g.id
      LEFT JOIN estoques e ON p.id = e.produto_id
      ${whereClause}
      GROUP BY p.id, p.codigo, p.descricao, p.unidade, g.nome, p.estoque_minimo, p.estoque_maximo
      ORDER BY quantidade_faltante DESC
    `;
    
    const [relatorio] = await pool.execute(query, params);
    
    if (formato === 'excel') {
      return exportToExcel(res, relatorio, 'rupturas_estoque');
    } else if (formato === 'pdf') {
      return exportToPDF(res, relatorio, 'Relatório de Rupturas');
    }
    
    res.json(relatorio);
    
  } catch (error) {
    console.error('Erro ao gerar relatório de rupturas:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Relatório de movimentações
router.get('/movimentacoes', async (req, res) => {
  try {
    const { 
      dataInicio, 
      dataFim, 
      tipo, 
      produtoId, 
      formato = 'json' 
    } = req.query;
    
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
    
    if (produtoId) {
      whereClause += ' AND m.produto_id = ?';
      params.push(produtoId);
    }
    
    const query = `
      SELECT 
        m.id,
        p.codigo as produto_codigo,
        p.descricao as produto_descricao,
        p.unidade as produto_unidade,
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
    
    const [relatorio] = await pool.execute(query, params);
    
    if (formato === 'excel') {
      return exportToExcel(res, relatorio, 'movimentacoes');
    } else if (formato === 'pdf') {
      return exportToPDF(res, relatorio, 'Relatório de Movimentações');
    }
    
    res.json(relatorio);
    
  } catch (error) {
    console.error('Erro ao gerar relatório de movimentações:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Relatório de empréstimos
router.get('/emprestimos', async (req, res) => {
  try {
    const { 
      dataInicio, 
      dataFim, 
      status, 
      colaboradorId, 
      formato = 'json' 
    } = req.query;
    
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
    
    if (colaboradorId) {
      whereClause += ' AND e.colaborador_id = ?';
      params.push(colaboradorId);
    }
    
    const query = `
      SELECT 
        e.id,
        c.nome as colaborador_nome,
        c.matricula as colaborador_matricula,
        c.setor as colaborador_setor,
        e.data_emprestimo,
        e.prazo_devolucao,
        e.data_devolucao,
        e.status,
        e.observacao,
        u.nome as usuario_solicitante
      FROM emprestimos e
      JOIN colaboradores c ON e.colaborador_id = c.id
      LEFT JOIN usuarios u ON e.usuario_solicitante = u.id
      ${whereClause}
      ORDER BY e.data_emprestimo DESC
    `;
    
    const [relatorio] = await pool.execute(query, params);
    
    if (formato === 'excel') {
      return exportToExcel(res, relatorio, 'emprestimos');
    } else if (formato === 'pdf') {
      return exportToPDF(res, relatorio, 'Relatório de Empréstimos');
    }
    
    res.json(relatorio);
    
  } catch (error) {
    console.error('Erro ao gerar relatório de empréstimos:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Dashboard - resumo geral
router.get('/dashboard', async (req, res) => {
  try {
    // Total de produtos
    const [totalProdutos] = await pool.execute(
      'SELECT COUNT(*) as total FROM produtos WHERE ativo = 1'
    );
    
    // Total de produtos com estoque baixo
    const [produtosBaixoEstoque] = await pool.execute(`
      SELECT COUNT(*) as total
      FROM produtos p
      LEFT JOIN estoques e ON p.id = e.produto_id
      WHERE p.ativo = 1
      GROUP BY p.id
      HAVING COALESCE(SUM(e.quantidade), 0) <= p.estoque_minimo
    `);
    
    // Total de empréstimos em aberto
    const [emprestimosAbertos] = await pool.execute(
      'SELECT COUNT(*) as total FROM emprestimos WHERE status = "aberto"'
    );
    
    // Total de empréstimos atrasados
    const [emprestimosAtrasados] = await pool.execute(
      'SELECT COUNT(*) as total FROM emprestimos WHERE status = "aberto" AND prazo_devolucao < CURDATE()'
    );
    
    // Movimentações do mês
    const [movimentacoesMes] = await pool.execute(`
      SELECT COUNT(*) as total
      FROM movimentacoes
      WHERE MONTH(data_movimentacao) = MONTH(CURDATE())
      AND YEAR(data_movimentacao) = YEAR(CURDATE())
    `);
    
    // Top 5 produtos mais movimentados
    const [topProdutos] = await pool.execute(`
      SELECT 
        p.codigo,
        p.descricao,
        COUNT(*) as total_movimentacoes,
        SUM(ABS(m.quantidade)) as total_quantidade
      FROM movimentacoes m
      JOIN produtos p ON m.produto_id = p.id
      WHERE MONTH(m.data_movimentacao) = MONTH(CURDATE())
      AND YEAR(m.data_movimentacao) = YEAR(CURDATE())
      GROUP BY p.id, p.codigo, p.descricao
      ORDER BY total_movimentacoes DESC
      LIMIT 5
    `);
    
    res.json({
      totalProdutos: totalProdutos[0].total,
      produtosBaixoEstoque: produtosBaixoEstoque.length,
      emprestimosAbertos: emprestimosAbertos[0].total,
      emprestimosAtrasados: emprestimosAtrasados[0].total,
      movimentacoesMes: movimentacoesMes[0].total,
      topProdutos
    });
    
  } catch (error) {
    console.error('Erro ao gerar dashboard:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// Função para exportar para Excel
function exportToExcel(res, data, filename) {
  try {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório');
    
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}.xlsx`);
    res.send(buffer);
  } catch (error) {
    console.error('Erro ao exportar para Excel:', error);
    res.status(500).json({ error: 'Erro ao exportar para Excel' });
  }
}

// Função para exportar para PDF
function exportToPDF(res, data, title) {
  try {
    const doc = new PDFDocument();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${title.toLowerCase().replace(/\s+/g, '_')}.pdf`);
    
    doc.pipe(res);
    
    // Cabeçalho
    doc.fontSize(20).text(title, 50, 50);
    doc.fontSize(12).text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 50, 80);
    doc.moveTo(50, 100).lineTo(550, 100).stroke();
    
    // Dados
    let y = 120;
    const pageHeight = 750;
    const rowHeight = 20;
    
    if (data.length > 0) {
      // Cabeçalho da tabela
      const headers = Object.keys(data[0]);
      let x = 50;
      
      headers.forEach(header => {
        doc.fontSize(10).text(header, x, y);
        x += 100;
      });
      
      y += 30;
      doc.moveTo(50, y).lineTo(550, y).stroke();
      y += 10;
      
      // Dados da tabela
      data.forEach(row => {
        if (y > pageHeight - 50) {
          doc.addPage();
          y = 50;
        }
        
        x = 50;
        headers.forEach(header => {
          doc.fontSize(8).text(String(row[header] || ''), x, y);
          x += 100;
        });
        
        y += rowHeight;
      });
    } else {
      doc.fontSize(12).text('Nenhum dado encontrado', 50, y);
    }
    
    doc.end();
  } catch (error) {
    console.error('Erro ao exportar para PDF:', error);
    res.status(500).json({ error: 'Erro ao exportar para PDF' });
  }
}

module.exports = router;