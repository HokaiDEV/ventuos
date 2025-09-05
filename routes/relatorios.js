const express = require('express');
const router = express.Router();

// Reports dashboard
router.get('/', async (req, res) => {
    try {
        res.render('relatorios/index', {
            title: 'Relatórios',
            user: req.user
        });
    } catch (error) {
        console.error('Erro ao carregar relatórios:', error);
        req.flash('error', 'Erro ao carregar relatórios');
        res.redirect('/dashboard');
    }
});

// Stock report
router.get('/estoque', async (req, res) => {
    try {
        const { formato, grupo, local, status } = req.query;
        
        let query = `
            SELECT 
                p.codigo, p.descricao, p.unidade,
                p.estoque_atual, p.estoque_minimo, p.estoque_maximo,
                p.estoque_requisitado, p.preco_custo,
                g.nome as grupo_nome,
                CASE 
                    WHEN p.estoque_minimo > 0 AND p.estoque_atual <= p.estoque_minimo THEN 'Baixo'
                    WHEN p.estoque_maximo > 0 AND p.estoque_atual >= p.estoque_maximo THEN 'Alto'
                    WHEN p.estoque_atual = 0 THEN 'Zerado'
                    ELSE 'Normal'
                END as status_estoque,
                (p.estoque_atual * p.preco_custo) as valor_total
            FROM produtos p
            LEFT JOIN grupos g ON p.grupo_id = g.id
            WHERE p.ativo = 1
        `;
        const params = [];

        if (grupo) {
            query += ` AND p.grupo_id = ?`;
            params.push(grupo);
        }

        if (status) {
            if (status === 'baixo') {
                query += ` AND p.estoque_minimo > 0 AND p.estoque_atual <= p.estoque_minimo`;
            } else if (status === 'zerado') {
                query += ` AND p.estoque_atual = 0`;
            } else if (status === 'alto') {
                query += ` AND p.estoque_maximo > 0 AND p.estoque_atual >= p.estoque_maximo`;
            }
        }

        query += ` ORDER BY p.descricao ASC`;

        const [produtos] = await req.db.execute(query, params);

        // Get groups for filter
        const [grupos] = await req.db.execute('SELECT * FROM grupos WHERE ativo = 1 ORDER BY nome');
        
        // Get locations for filter
        const [locais] = await req.db.execute('SELECT * FROM locais_estoque WHERE ativo = 1 ORDER BY nome');

        // Calculate totals
        const totals = {
            produtos: produtos.length,
            valor_total: produtos.reduce((sum, p) => sum + (p.valor_total || 0), 0),
            estoque_baixo: produtos.filter(p => p.status_estoque === 'Baixo').length,
            estoque_zerado: produtos.filter(p => p.status_estoque === 'Zerado').length
        };

        if (formato === 'csv') {
            // Export as CSV
            let csv = 'Código,Descrição,Grupo,Unidade,Estoque Atual,Estoque Mínimo,Estoque Máximo,Status,Valor Unitário,Valor Total\n';
            
            produtos.forEach(produto => {
                csv += [
                    produto.codigo,
                    `"${produto.descricao}"`,
                    produto.grupo_nome || '',
                    produto.unidade,
                    produto.estoque_atual,
                    produto.estoque_minimo,
                    produto.estoque_maximo,
                    produto.status_estoque,
                    produto.preco_custo.toFixed(2),
                    (produto.valor_total || 0).toFixed(2)
                ].join(',') + '\n';
            });

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="relatorio_estoque.csv"');
            return res.send(csv);
        }

        res.render('relatorios/estoque', {
            title: 'Relatório de Estoque',
            produtos,
            grupos,
            locais,
            totals,
            filters: { grupo, local, status },
            user: req.user
        });
    } catch (error) {
        console.error('Erro ao gerar relatório de estoque:', error);
        req.flash('error', 'Erro ao gerar relatório');
        res.redirect('/relatorios');
    }
});

// Movements report
router.get('/movimentacoes', async (req, res) => {
    try {
        const { 
            formato, 
            data_inicio, 
            data_fim, 
            produto_id, 
            tipo, 
            usuario_id,
            limite = 100 
        } = req.query;
        
        let query = `
            SELECT 
                m.*,
                p.codigo as produto_codigo, p.descricao as produto_descricao,
                u.nome as usuario_nome,
                l.nome as local_nome, l.codigo as local_codigo
            FROM movimentacoes m
            JOIN produtos p ON m.produto_id = p.id
            LEFT JOIN usuarios u ON m.usuario_id = u.id
            LEFT JOIN locais_estoque l ON m.local_id = l.id
            WHERE 1=1
        `;
        const params = [];

        if (data_inicio) {
            query += ` AND DATE(m.data_movimentacao) >= ?`;
            params.push(data_inicio);
        }

        if (data_fim) {
            query += ` AND DATE(m.data_movimentacao) <= ?`;
            params.push(data_fim);
        }

        if (produto_id) {
            query += ` AND m.produto_id = ?`;
            params.push(produto_id);
        }

        if (tipo) {
            query += ` AND m.tipo = ?`;
            params.push(tipo);
        }

        if (usuario_id) {
            query += ` AND m.usuario_id = ?`;
            params.push(usuario_id);
        }

        query += ` ORDER BY m.data_movimentacao DESC LIMIT ?`;
        params.push(parseInt(limite));

        const [movimentacoes] = await req.db.execute(query, params);

        // Get additional data for filters
        const [produtos] = await req.db.execute('SELECT id, codigo, descricao FROM produtos WHERE ativo = 1 ORDER BY descricao LIMIT 50');
        const [usuarios] = await req.db.execute('SELECT id, nome FROM usuarios WHERE ativo = 1 ORDER BY nome');

        // Calculate summary
        const summary = {
            total_movimentacoes: movimentacoes.length,
            entradas: movimentacoes.filter(m => ['entrada', 'emprestimo_retorno', 'transferencia_entrada'].includes(m.tipo)).length,
            saidas: movimentacoes.filter(m => ['saida', 'emprestimo_saida', 'transferencia_saida'].includes(m.tipo)).length,
            periodo: data_inicio && data_fim ? `${data_inicio} a ${data_fim}` : 'Últimas movimentações'
        };

        if (formato === 'csv') {
            // Export as CSV
            let csv = 'Data,Hora,Produto,Tipo,Quantidade,Local,Usuário,Referência,Observação\n';
            
            movimentacoes.forEach(mov => {
                const data = new Date(mov.data_movimentacao);
                csv += [
                    data.toLocaleDateString('pt-BR'),
                    data.toLocaleTimeString('pt-BR'),
                    `"${mov.produto_descricao}"`,
                    mov.tipo,
                    mov.quantidade,
                    mov.local_nome || '',
                    mov.usuario_nome || '',
                    mov.referencia || '',
                    `"${mov.observacao || ''}"`
                ].join(',') + '\n';
            });

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="relatorio_movimentacoes.csv"');
            return res.send(csv);
        }

        res.render('relatorios/movimentacoes', {
            title: 'Relatório de Movimentações',
            movimentacoes,
            produtos,
            usuarios,
            summary,
            filters: { data_inicio, data_fim, produto_id, tipo, usuario_id, limite },
            user: req.user
        });
    } catch (error) {
        console.error('Erro ao gerar relatório de movimentações:', error);
        req.flash('error', 'Erro ao gerar relatório');
        res.redirect('/relatorios');
    }
});

// Loans report
router.get('/emprestimos', async (req, res) => {
    try {
        const { 
            formato, 
            data_inicio, 
            data_fim, 
            colaborador_id, 
            status,
            vencidos = false
        } = req.query;
        
        let query = `
            SELECT 
                e.*,
                c.nome as colaborador_nome, c.matricula as colaborador_matricula, c.setor,
                us.nome as solicitante_nome,
                COUNT(ei.id) as total_itens,
                SUM(ei.quantidade_emprestada) as total_emprestado,
                SUM(ei.quantidade_devolvida) as total_devolvido,
                CASE 
                    WHEN e.status = 'aberto' AND e.prazo_devolucao < CURDATE() THEN 'Vencido'
                    ELSE e.status
                END as status_real
            FROM emprestimos e
            JOIN colaboradores c ON e.colaborador_id = c.id
            LEFT JOIN usuarios us ON e.usuario_solicitante_id = us.id
            LEFT JOIN emprestimo_itens ei ON e.id = ei.emprestimo_id
            WHERE 1=1
        `;
        const params = [];

        if (data_inicio) {
            query += ` AND DATE(e.data_emprestimo) >= ?`;
            params.push(data_inicio);
        }

        if (data_fim) {
            query += ` AND DATE(e.data_emprestimo) <= ?`;
            params.push(data_fim);
        }

        if (colaborador_id) {
            query += ` AND e.colaborador_id = ?`;
            params.push(colaborador_id);
        }

        if (status) {
            query += ` AND e.status = ?`;
            params.push(status);
        }

        if (vencidos === 'true') {
            query += ` AND e.status IN ('aberto', 'parcialmente_devolvido') AND e.prazo_devolucao < CURDATE()`;
        }

        query += ` 
            GROUP BY e.id
            ORDER BY e.data_emprestimo DESC
        `;

        const [emprestimos] = await req.db.execute(query, params);

        // Get collaborators for filter
        const [colaboradores] = await req.db.execute('SELECT id, nome FROM colaboradores WHERE ativo = 1 ORDER BY nome LIMIT 50');

        // Calculate summary
        const summary = {
            total_emprestimos: emprestimos.length,
            abertos: emprestimos.filter(e => ['aberto', 'parcialmente_devolvido'].includes(e.status)).length,
            vencidos: emprestimos.filter(e => e.status_real === 'Vencido').length,
            devolvidos: emprestimos.filter(e => e.status === 'devolvido').length
        };

        if (formato === 'csv') {
            // Export as CSV
            let csv = 'Código,Data Empréstimo,Colaborador,Matrícula,Setor,Prazo Devolução,Status,Total Itens,Solicitante\n';
            
            emprestimos.forEach(emp => {
                csv += [
                    emp.codigo,
                    new Date(emp.data_emprestimo).toLocaleDateString('pt-BR'),
                    `"${emp.colaborador_nome}"`,
                    emp.colaborador_matricula || '',
                    emp.setor || '',
                    new Date(emp.prazo_devolucao).toLocaleDateString('pt-BR'),
                    emp.status_real,
                    emp.total_itens,
                    emp.solicitante_nome || ''
                ].join(',') + '\n';
            });

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="relatorio_emprestimos.csv"');
            return res.send(csv);
        }

        res.render('relatorios/emprestimos', {
            title: 'Relatório de Empréstimos',
            emprestimos,
            colaboradores,
            summary,
            filters: { data_inicio, data_fim, colaborador_id, status, vencidos },
            user: req.user
        });
    } catch (error) {
        console.error('Erro ao gerar relatório de empréstimos:', error);
        req.flash('error', 'Erro ao gerar relatório');
        res.redirect('/relatorios');
    }
});

// Transfers report
router.get('/transferencias', async (req, res) => {
    try {
        const { 
            formato, 
            data_inicio, 
            data_fim, 
            origem_id, 
            destino_id, 
            status 
        } = req.query;
        
        let query = `
            SELECT 
                t.*,
                lo.nome as origem_nome, lo.codigo as origem_codigo,
                ld.nome as destino_nome, ld.codigo as destino_codigo,
                us.nome as solicitante_nome,
                ua.nome as aprovador_nome,
                COUNT(ti.id) as total_itens,
                SUM(ti.quantidade_solicitada) as total_solicitado,
                SUM(ti.quantidade_recebida) as total_recebido
            FROM transferencias t
            JOIN locais_estoque lo ON t.origem_local_id = lo.id
            JOIN locais_estoque ld ON t.destino_local_id = ld.id
            LEFT JOIN usuarios us ON t.solicitante_id = us.id
            LEFT JOIN usuarios ua ON t.aprovador_id = ua.id
            LEFT JOIN transferencia_itens ti ON t.id = ti.transferencia_id
            WHERE 1=1
        `;
        const params = [];

        if (data_inicio) {
            query += ` AND DATE(t.data_solicitacao) >= ?`;
            params.push(data_inicio);
        }

        if (data_fim) {
            query += ` AND DATE(t.data_solicitacao) <= ?`;
            params.push(data_fim);
        }

        if (origem_id) {
            query += ` AND t.origem_local_id = ?`;
            params.push(origem_id);
        }

        if (destino_id) {
            query += ` AND t.destino_local_id = ?`;
            params.push(destino_id);
        }

        if (status) {
            query += ` AND t.status = ?`;
            params.push(status);
        }

        query += ` 
            GROUP BY t.id
            ORDER BY t.data_solicitacao DESC
        `;

        const [transferencias] = await req.db.execute(query, params);

        // Get locations for filter
        const [locais] = await req.db.execute('SELECT id, nome FROM locais_estoque WHERE ativo = 1 ORDER BY nome');

        // Calculate summary
        const summary = {
            total_transferencias: transferencias.length,
            pendentes: transferencias.filter(t => t.status === 'pendente').length,
            aprovadas: transferencias.filter(t => t.status === 'aprovada').length,
            concluidas: transferencias.filter(t => t.status === 'concluida').length,
            canceladas: transferencias.filter(t => t.status === 'cancelada').length
        };

        if (formato === 'csv') {
            // Export as CSV
            let csv = 'Código,Data Solicitação,Origem,Destino,Status,Total Itens,Solicitante,Aprovador\n';
            
            transferencias.forEach(trans => {
                csv += [
                    trans.codigo,
                    new Date(trans.data_solicitacao).toLocaleDateString('pt-BR'),
                    `"${trans.origem_nome}"`,
                    `"${trans.destino_nome}"`,
                    trans.status,
                    trans.total_itens,
                    trans.solicitante_nome || '',
                    trans.aprovador_nome || ''
                ].join(',') + '\n';
            });

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="relatorio_transferencias.csv"');
            return res.send(csv);
        }

        res.render('relatorios/transferencias', {
            title: 'Relatório de Transferências',
            transferencias,
            locais,
            summary,
            filters: { data_inicio, data_fim, origem_id, destino_id, status },
            user: req.user
        });
    } catch (error) {
        console.error('Erro ao gerar relatório de transferências:', error);
        req.flash('error', 'Erro ao gerar relatório');
        res.redirect('/relatorios');
    }
});

// API endpoints for dashboard stats
router.get('/api/dashboard/stats', async (req, res) => {
    try {
        const [produtosCount] = await req.db.execute('SELECT COUNT(*) as total FROM produtos WHERE ativo = 1');
        const [estoquesBaixos] = await req.db.execute(`
            SELECT COUNT(*) as total FROM produtos 
            WHERE ativo = 1 AND estoque_atual <= estoque_minimo AND estoque_minimo > 0
        `);
        const [emprestimosAbertos] = await req.db.execute(`
            SELECT COUNT(*) as total FROM emprestimos 
            WHERE status IN ('aberto', 'parcialmente_devolvido', 'atrasado')
        `);
        const [transferenciasPendentes] = await req.db.execute(`
            SELECT COUNT(*) as total FROM transferencias 
            WHERE status IN ('pendente', 'aprovada', 'em_transito')
        `);

        res.json({
            produtos: produtosCount[0].total,
            estoquesBaixos: estoquesBaixos[0].total,
            emprestimosAbertos: emprestimosAbertos[0].total,
            transferenciasPendentes: transferenciasPendentes[0].total
        });
    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

router.get('/api/dashboard/quick-stats', async (req, res) => {
    try {
        const [produtosCount] = await req.db.execute('SELECT COUNT(*) as total FROM produtos WHERE ativo = 1');
        const [estoquesBaixos] = await req.db.execute(`
            SELECT COUNT(*) as total FROM produtos 
            WHERE ativo = 1 AND estoque_atual <= estoque_minimo AND estoque_minimo > 0
        `);
        const [emprestimosAbertos] = await req.db.execute(`
            SELECT COUNT(*) as total FROM emprestimos 
            WHERE status IN ('aberto', 'parcialmente_devolvido', 'atrasado')
        `);

        res.json({
            produtos: produtosCount[0].total,
            estoquesBaixos: estoquesBaixos[0].total,
            emprestimosAbertos: emprestimosAbertos[0].total
        });
    } catch (error) {
        console.error('Erro ao buscar estatísticas rápidas:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

module.exports = router;