const express = require('express');
const router = express.Router();

// List loans
router.get('/', async (req, res) => {
    try {
        const { status, colaborador, search } = req.query;
        
        let query = `
            SELECT 
                e.*,
                c.nome as colaborador_nome, c.matricula as colaborador_matricula,
                us.nome as solicitante_nome,
                ua.nome as autorizador_nome,
                COUNT(ei.id) as total_itens,
                SUM(ei.quantidade_emprestada) as total_quantidade,
                SUM(ei.quantidade_devolvida) as total_devolvido
            FROM emprestimos e
            JOIN colaboradores c ON e.colaborador_id = c.id
            LEFT JOIN usuarios us ON e.usuario_solicitante_id = us.id
            LEFT JOIN usuarios ua ON e.usuario_autorizador_id = ua.id
            LEFT JOIN emprestimo_itens ei ON e.id = ei.emprestimo_id
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            query += ` AND e.status = ?`;
            params.push(status);
        }

        if (colaborador) {
            query += ` AND e.colaborador_id = ?`;
            params.push(colaborador);
        }

        if (search) {
            query += ` AND (e.codigo LIKE ? OR c.nome LIKE ? OR c.matricula LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += ` 
            GROUP BY e.id
            ORDER BY e.data_emprestimo DESC
        `;

        const [emprestimos] = await req.db.execute(query, params);

        // Get collaborators for filter
        const [colaboradores] = await req.db.execute(
            'SELECT * FROM colaboradores WHERE ativo = 1 ORDER BY nome'
        );

        res.render('emprestimos/index', {
            title: 'Empréstimos',
            emprestimos,
            colaboradores,
            filters: { status, colaborador, search },
            user: req.user
        });
    } catch (error) {
        console.error('Erro ao listar empréstimos:', error);
        req.flash('error', 'Erro ao carregar empréstimos');
        res.redirect('/dashboard');
    }
});

// Show new loan form
router.get('/novo', async (req, res) => {
    try {
        const { produto, colaborador } = req.query;
        
        const [produtos] = await req.db.execute(`
            SELECT p.*, COALESCE(SUM(e.quantidade - e.quantidade_reservada), p.estoque_atual) as disponivel
            FROM produtos p
            LEFT JOIN estoques e ON p.id = e.produto_id
            WHERE p.ativo = 1 AND p.estoque_atual > 0
            GROUP BY p.id
            HAVING disponivel > 0
            ORDER BY p.descricao
        `);
        
        const [colaboradores] = await req.db.execute(
            'SELECT * FROM colaboradores WHERE ativo = 1 ORDER BY nome'
        );
        
        const [locais] = await req.db.execute(
            'SELECT * FROM locais_estoque WHERE ativo = 1 ORDER BY nome'
        );

        let produtoSelecionado = null;
        if (produto) {
            const [produtoData] = await req.db.execute(
                'SELECT * FROM produtos WHERE id = ? AND ativo = 1',
                [produto]
            );
            produtoSelecionado = produtoData[0] || null;
        }

        let colaboradorSelecionado = null;
        if (colaborador) {
            const [colaboradorData] = await req.db.execute(
                'SELECT * FROM colaboradores WHERE id = ? AND ativo = 1',
                [colaborador]
            );
            colaboradorSelecionado = colaboradorData[0] || null;
        }

        res.render('emprestimos/form', {
            title: 'Novo Empréstimo',
            emprestimo: null,
            produtos,
            colaboradores,
            locais,
            produtoSelecionado,
            colaboradorSelecionado,
            user: req.user
        });
    } catch (error) {
        console.error('Erro ao carregar formulário de empréstimo:', error);
        req.flash('error', 'Erro ao carregar formulário');
        res.redirect('/emprestimos');
    }
});

// Create loan
router.post('/', async (req, res) => {
    try {
        const {
            colaborador_id,
            prazo_devolucao,
            observacao,
            termo_responsabilidade,
            produtos
        } = req.body;

        if (!colaborador_id) {
            req.flash('error', 'Colaborador é obrigatório');
            return res.redirect('/emprestimos/novo');
        }

        if (!prazo_devolucao) {
            req.flash('error', 'Prazo de devolução é obrigatório');
            return res.redirect('/emprestimos/novo');
        }

        if (!produtos || produtos.length === 0) {
            req.flash('error', 'Adicione pelo menos um produto');
            return res.redirect('/emprestimos/novo');
        }

        // Start transaction
        await req.db.execute('START TRANSACTION');

        try {
            // Set audit user
            await req.db.execute('SET @current_user_id = ?', [req.user.id]);

            // Generate loan code
            const loanCode = `EMP${Date.now()}`;

            // Create loan record
            const [loanResult] = await req.db.execute(`
                INSERT INTO emprestimos (
                    codigo, colaborador_id, usuario_solicitante_id,
                    prazo_devolucao, observacao, termo_responsabilidade, status
                ) VALUES (?, ?, ?, ?, ?, ?, 'aberto')
            `, [
                loanCode,
                colaborador_id,
                req.user.id,
                prazo_devolucao,
                observacao || null,
                termo_responsabilidade || null
            ]);

            const loanId = loanResult.insertId;

            // Process each product
            for (const produtoData of produtos) {
                const { produto_id, quantidade, local_origem_id, condicao_saida, observacao_saida } = produtoData;
                
                if (!produto_id || !quantidade || quantidade <= 0) continue;

                // Check if there's enough stock
                let stockCheck;
                if (local_origem_id) {
                    [stockCheck] = await req.db.execute(`
                        SELECT COALESCE(quantidade - quantidade_reservada, 0) as disponivel
                        FROM estoques 
                        WHERE produto_id = ? AND local_id = ?
                    `, [produto_id, local_origem_id]);
                } else {
                    [stockCheck] = await req.db.execute(`
                        SELECT estoque_atual as disponivel
                        FROM produtos 
                        WHERE id = ?
                    `, [produto_id]);
                }

                const disponivel = stockCheck[0]?.disponivel || 0;
                if (disponivel < parseInt(quantidade)) {
                    throw new Error(`Estoque insuficiente para o produto ID ${produto_id}`);
                }

                // Insert loan item
                await req.db.execute(`
                    INSERT INTO emprestimo_itens (
                        emprestimo_id, produto_id, local_origem_id,
                        quantidade_emprestada, condicao_saida, observacao_saida
                    ) VALUES (?, ?, ?, ?, ?, ?)
                `, [
                    loanId,
                    produto_id,
                    local_origem_id || null,
                    parseInt(quantidade),
                    condicao_saida || 'usado',
                    observacao_saida || null
                ]);

                // Update product stock
                await req.db.execute(`
                    UPDATE produtos 
                    SET estoque_atual = estoque_atual - ?,
                        estoque_requisitado = estoque_requisitado + ?
                    WHERE id = ?
                `, [parseInt(quantidade), parseInt(quantidade), produto_id]);

                // Update stock by location if specified
                if (local_origem_id) {
                    await req.db.execute(`
                        UPDATE estoques 
                        SET quantidade = quantidade - ?
                        WHERE produto_id = ? AND local_id = ?
                    `, [parseInt(quantidade), produto_id, local_origem_id]);
                }

                // Record movement
                await req.db.execute(`
                    INSERT INTO movimentacoes (
                        produto_id, local_id, tipo, quantidade, 
                        usuario_id, documento_id, referencia
                    ) VALUES (?, ?, 'emprestimo_saida', ?, ?, ?, ?)
                `, [
                    produto_id,
                    local_origem_id,
                    -parseInt(quantidade),
                    req.user.id,
                    loanId,
                    loanCode
                ]);
            }

            await req.db.execute('COMMIT');

            req.flash('success', `Empréstimo registrado com sucesso! Código: ${loanCode}`);
            res.redirect(`/emprestimos/${loanId}`);

        } catch (error) {
            await req.db.execute('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Erro ao criar empréstimo:', error);
        req.flash('error', error.message || 'Erro ao criar empréstimo');
        res.redirect('/emprestimos/novo');
    }
});

// Show loan details
router.get('/:id', async (req, res) => {
    try {
        const [emprestimos] = await req.db.execute(`
            SELECT 
                e.*,
                c.nome as colaborador_nome, c.matricula as colaborador_matricula,
                c.setor as colaborador_setor, c.gestor as colaborador_gestor,
                us.nome as solicitante_nome,
                ua.nome as autorizador_nome
            FROM emprestimos e
            JOIN colaboradores c ON e.colaborador_id = c.id
            LEFT JOIN usuarios us ON e.usuario_solicitante_id = us.id
            LEFT JOIN usuarios ua ON e.usuario_autorizador_id = ua.id
            WHERE e.id = ?
        `, [req.params.id]);

        if (emprestimos.length === 0) {
            req.flash('error', 'Empréstimo não encontrado');
            return res.redirect('/emprestimos');
        }

        const emprestimo = emprestimos[0];

        // Get loan items
        const [itens] = await req.db.execute(`
            SELECT 
                ei.*, 
                p.codigo, p.descricao, p.unidade,
                l.nome as local_origem_nome, l.codigo as local_origem_codigo
            FROM emprestimo_itens ei
            JOIN produtos p ON ei.produto_id = p.id
            LEFT JOIN locais_estoque l ON ei.local_origem_id = l.id
            WHERE ei.emprestimo_id = ?
            ORDER BY p.descricao
        `, [req.params.id]);

        // Check if loan is overdue
        const isOverdue = emprestimo.status === 'aberto' && 
                         new Date(emprestimo.prazo_devolucao) < new Date();

        // Update status if overdue
        if (isOverdue && emprestimo.status !== 'atrasado') {
            await req.db.execute(
                'UPDATE emprestimos SET status = "atrasado" WHERE id = ?',
                [req.params.id]
            );
            emprestimo.status = 'atrasado';
        }

        res.render('emprestimos/show', {
            title: `Empréstimo: ${emprestimo.codigo}`,
            emprestimo,
            itens,
            isOverdue,
            user: req.user
        });
    } catch (error) {
        console.error('Erro ao carregar empréstimo:', error);
        req.flash('error', 'Erro ao carregar empréstimo');
        res.redirect('/emprestimos');
    }
});

// Return loan items
router.post('/:id/devolucao', async (req, res) => {
    try {
        const { itens } = req.body;

        if (!itens || Object.keys(itens).length === 0) {
            req.flash('error', 'Selecione pelo menos um item para devolução');
            return res.redirect(`/emprestimos/${req.params.id}`);
        }

        await req.db.execute('START TRANSACTION');

        try {
            // Set audit user
            await req.db.execute('SET @current_user_id = ?', [req.user.id]);

            let totalDevolvido = 0;
            let totalItens = 0;

            // Process each returned item
            for (const [itemId, itemData] of Object.entries(itens)) {
                const { quantidade_devolvida, condicao_retorno, observacao_retorno } = itemData;
                
                if (!quantidade_devolvida || quantidade_devolvida <= 0) continue;

                // Get item details
                const [itemDetails] = await req.db.execute(`
                    SELECT ei.*, p.id as produto_id
                    FROM emprestimo_itens ei
                    JOIN produtos p ON ei.produto_id = p.id
                    WHERE ei.id = ? AND ei.emprestimo_id = ?
                `, [itemId, req.params.id]);

                if (itemDetails.length === 0) continue;

                const item = itemDetails[0];
                const quantidadeDevolver = parseInt(quantidade_devolvida);
                const jaDevolvido = item.quantidade_devolvida || 0;
                const pendente = item.quantidade_emprestada - jaDevolvido;

                if (quantidadeDevolver > pendente) {
                    throw new Error(`Quantidade a devolver (${quantidadeDevolver}) maior que o pendente (${pendente})`);
                }

                // Update item return info
                await req.db.execute(`
                    UPDATE emprestimo_itens 
                    SET 
                        quantidade_devolvida = quantidade_devolvida + ?,
                        condicao_retorno = ?,
                        observacao_retorno = ?,
                        data_devolucao_item = NOW()
                    WHERE id = ?
                `, [
                    quantidadeDevolver,
                    condicao_retorno || 'usado',
                    observacao_retorno || null,
                    itemId
                ]);

                // Return stock to product
                await req.db.execute(`
                    UPDATE produtos 
                    SET 
                        estoque_atual = estoque_atual + ?,
                        estoque_requisitado = estoque_requisitado - ?
                    WHERE id = ?
                `, [quantidadeDevolver, quantidadeDevolver, item.produto_id]);

                // Return stock to location if specified
                if (item.local_origem_id) {
                    await req.db.execute(`
                        UPDATE estoques 
                        SET quantidade = quantidade + ?
                        WHERE produto_id = ? AND local_id = ?
                    `, [quantidadeDevolver, item.produto_id, item.local_origem_id]);
                }

                // Record movement
                await req.db.execute(`
                    INSERT INTO movimentacoes (
                        produto_id, local_id, tipo, quantidade, 
                        usuario_id, documento_id, referencia
                    ) VALUES (?, ?, 'emprestimo_retorno', ?, ?, ?, ?)
                `, [
                    item.produto_id,
                    item.local_origem_id,
                    quantidadeDevolver,
                    req.user.id,
                    req.params.id,
                    `DEV-${req.params.id}`
                ]);

                totalDevolvido += quantidadeDevolver;
                totalItens++;
            }

            // Check if all items are returned
            const [pendingCheck] = await req.db.execute(`
                SELECT SUM(quantidade_emprestada - quantidade_devolvida) as pendente
                FROM emprestimo_itens
                WHERE emprestimo_id = ?
            `, [req.params.id]);

            const totalPendente = pendingCheck[0]?.pendente || 0;

            // Update loan status
            let novoStatus = 'parcialmente_devolvido';
            if (totalPendente === 0) {
                novoStatus = 'devolvido';
                await req.db.execute(
                    'UPDATE emprestimos SET status = ?, data_devolucao = NOW() WHERE id = ?',
                    [novoStatus, req.params.id]
                );
            } else {
                await req.db.execute(
                    'UPDATE emprestimos SET status = ? WHERE id = ?',
                    [novoStatus, req.params.id]
                );
            }

            await req.db.execute('COMMIT');

            req.flash('success', `Devolução registrada com sucesso! ${totalItens} item(ns) devolvido(s).`);
            res.redirect(`/emprestimos/${req.params.id}`);

        } catch (error) {
            await req.db.execute('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Erro ao processar devolução:', error);
        req.flash('error', error.message || 'Erro ao processar devolução');
        res.redirect(`/emprestimos/${req.params.id}`);
    }
});

// API endpoints
router.get('/api/vencendo', async (req, res) => {
    try {
        const [emprestimos] = await req.db.execute(`
            SELECT 
                e.codigo, e.prazo_devolucao,
                c.nome as colaborador_nome,
                GROUP_CONCAT(p.descricao SEPARATOR ', ') as produtos
            FROM emprestimos e
            JOIN colaboradores c ON e.colaborador_id = c.id
            JOIN emprestimo_itens ei ON e.id = ei.emprestimo_id
            JOIN produtos p ON ei.produto_id = p.id
            WHERE e.status IN ('aberto', 'parcialmente_devolvido', 'atrasado')
            AND e.prazo_devolucao <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)
            GROUP BY e.id
            ORDER BY e.prazo_devolucao ASC
            LIMIT 10
        `);

        res.json(emprestimos.map(emp => ({
            ...emp,
            produto_nome: emp.produtos.split(', ')[0] + (emp.produtos.includes(',') ? '...' : '')
        })));
    } catch (error) {
        console.error('Erro ao buscar empréstimos vencendo:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

module.exports = router;