const express = require('express');
const router = express.Router();

// List stock
router.get('/', async (req, res) => {
    try {
        const { filtro, local, grupo, search } = req.query;
        
        let query = `
            SELECT 
                p.id, p.codigo, p.descricao, p.unidade,
                p.estoque_atual, p.estoque_minimo, p.estoque_maximo,
                p.estoque_requisitado,
                g.nome as grupo_nome,
                COALESCE(SUM(e.quantidade), 0) as total_estoque
            FROM produtos p
            LEFT JOIN grupos g ON p.grupo_id = g.id
            LEFT JOIN estoques e ON p.id = e.produto_id
            WHERE p.ativo = 1
        `;
        const params = [];

        if (search) {
            query += ` AND (p.codigo LIKE ? OR p.descricao LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`);
        }

        if (grupo) {
            query += ` AND p.grupo_id = ?`;
            params.push(grupo);
        }

        query += ` GROUP BY p.id`;

        // Apply filters after grouping
        if (filtro === 'baixo') {
            query += ` HAVING p.estoque_minimo > 0 AND p.estoque_atual <= p.estoque_minimo`;
        } else if (filtro === 'zerado') {
            query += ` HAVING p.estoque_atual = 0`;
        } else if (filtro === 'alto') {
            query += ` HAVING p.estoque_maximo > 0 AND p.estoque_atual >= p.estoque_maximo`;
        }

        query += ` ORDER BY p.descricao ASC`;

        const [produtos] = await req.db.execute(query, params);

        // Get groups for filter
        const [grupos] = await req.db.execute('SELECT * FROM grupos WHERE ativo = 1 ORDER BY nome');
        
        // Get locations for filter
        const [locais] = await req.db.execute('SELECT * FROM locais_estoque WHERE ativo = 1 ORDER BY nome');

        res.render('estoque/index', {
            title: 'Controle de Estoque',
            produtos,
            grupos,
            locais,
            filters: { filtro, local, grupo, search },
            user: req.user
        });
    } catch (error) {
        console.error('Erro ao listar estoque:', error);
        req.flash('error', 'Erro ao carregar estoque');
        res.redirect('/dashboard');
    }
});

// Show stock entry form
router.get('/entrada', async (req, res) => {
    try {
        const { produto } = req.query;
        
        const [produtos] = await req.db.execute(
            'SELECT * FROM produtos WHERE ativo = 1 ORDER BY descricao'
        );
        
        const [fornecedores] = await req.db.execute(
            'SELECT * FROM fornecedores WHERE ativo = 1 ORDER BY nome'
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

        res.render('estoque/entrada', {
            title: 'Entrada de Estoque',
            produtos,
            fornecedores,
            locais,
            produtoSelecionado,
            user: req.user
        });
    } catch (error) {
        console.error('Erro ao carregar formulário de entrada:', error);
        req.flash('error', 'Erro ao carregar formulário');
        res.redirect('/estoque');
    }
});

// Process stock entry
router.post('/entrada', async (req, res) => {
    try {
        const {
            fornecedor_id,
            numero_documento,
            tipo_documento,
            local_destino_id,
            observacao,
            produtos
        } = req.body;

        if (!produtos || produtos.length === 0) {
            req.flash('error', 'Adicione pelo menos um produto');
            return res.redirect('/estoque/entrada');
        }

        // Start transaction
        await req.db.execute('START TRANSACTION');

        try {
            // Set audit user
            await req.db.execute('SET @current_user_id = ?', [req.user.id]);

            // Generate entry code
            const entryCode = `ENT${Date.now()}`;

            // Create entry record
            const [entryResult] = await req.db.execute(`
                INSERT INTO entradas (
                    codigo, fornecedor_id, numero_documento, tipo_documento,
                    local_destino_id, usuario_id, observacao, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente')
            `, [
                entryCode,
                fornecedor_id || null,
                numero_documento || null,
                tipo_documento || 'interno',
                local_destino_id || null,
                req.user.id,
                observacao || null
            ]);

            const entryId = entryResult.insertId;

            // Process each product
            for (const produtoData of produtos) {
                const { produto_id, quantidade, custo_unitario, lote, data_validade } = produtoData;
                
                if (!produto_id || !quantidade || quantidade <= 0) continue;

                // Insert entry item
                await req.db.execute(`
                    INSERT INTO entrada_itens (
                        entrada_id, produto_id, quantidade_solicitada, 
                        quantidade_recebida, custo_unitario, lote, data_validade
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [
                    entryId,
                    produto_id,
                    parseInt(quantidade),
                    parseInt(quantidade),
                    parseFloat(custo_unitario) || 0,
                    lote || null,
                    data_validade || null
                ]);

                // Update product stock
                await req.db.execute(`
                    UPDATE produtos 
                    SET estoque_atual = estoque_atual + ?,
                        preco_custo = CASE WHEN ? > 0 THEN ? ELSE preco_custo END
                    WHERE id = ?
                `, [
                    parseInt(quantidade),
                    parseFloat(custo_unitario) || 0,
                    parseFloat(custo_unitario) || 0,
                    produto_id
                ]);

                // Update stock by location if specified
                if (local_destino_id) {
                    await req.db.execute(`
                        INSERT INTO estoques (produto_id, local_id, quantidade)
                        VALUES (?, ?, ?)
                        ON DUPLICATE KEY UPDATE quantidade = quantidade + VALUES(quantidade)
                    `, [produto_id, local_destino_id, parseInt(quantidade)]);
                }

                // Record movement
                await req.db.execute(`
                    INSERT INTO movimentacoes (
                        produto_id, local_id, tipo, quantidade, 
                        usuario_id, documento_id, referencia
                    ) VALUES (?, ?, 'entrada', ?, ?, ?, ?)
                `, [
                    produto_id,
                    local_destino_id,
                    parseInt(quantidade),
                    req.user.id,
                    entryId,
                    entryCode
                ]);
            }

            // Mark entry as completed
            await req.db.execute(
                'UPDATE entradas SET status = "finalizada" WHERE id = ?',
                [entryId]
            );

            await req.db.execute('COMMIT');

            req.flash('success', `Entrada registrada com sucesso! Código: ${entryCode}`);
            res.redirect('/estoque');

        } catch (error) {
            await req.db.execute('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Erro ao processar entrada:', error);
        req.flash('error', 'Erro ao processar entrada de estoque');
        res.redirect('/estoque/entrada');
    }
});

// Show stock exit form
router.get('/saida', async (req, res) => {
    try {
        const { produto } = req.query;
        
        const [produtos] = await req.db.execute(`
            SELECT p.*, COALESCE(SUM(e.quantidade - e.quantidade_reservada), p.estoque_atual) as disponivel
            FROM produtos p
            LEFT JOIN estoques e ON p.id = e.produto_id
            WHERE p.ativo = 1 AND p.estoque_atual > 0
            GROUP BY p.id
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

        res.render('estoque/saida', {
            title: 'Saída de Estoque',
            produtos,
            colaboradores,
            locais,
            produtoSelecionado,
            user: req.user
        });
    } catch (error) {
        console.error('Erro ao carregar formulário de saída:', error);
        req.flash('error', 'Erro ao carregar formulário');
        res.redirect('/estoque');
    }
});

// API endpoints
router.get('/api/baixo', async (req, res) => {
    try {
        const [produtos] = await req.db.execute(`
            SELECT codigo, descricao, estoque_atual, estoque_minimo
            FROM produtos 
            WHERE ativo = 1 
            AND estoque_minimo > 0 
            AND estoque_atual <= estoque_minimo
            ORDER BY (estoque_atual / NULLIF(estoque_minimo, 0)) ASC
            LIMIT 10
        `);

        res.json(produtos);
    } catch (error) {
        console.error('Erro ao buscar produtos com estoque baixo:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

router.get('/api/movimentacoes', async (req, res) => {
    try {
        const { produto, limite = 50 } = req.query;
        
        let query = `
            SELECT m.*, p.descricao as produto_nome, u.nome as usuario_nome, l.nome as local_nome
            FROM movimentacoes m
            JOIN produtos p ON m.produto_id = p.id
            LEFT JOIN usuarios u ON m.usuario_id = u.id
            LEFT JOIN locais_estoque l ON m.local_id = l.id
            WHERE 1=1
        `;
        const params = [];

        if (produto) {
            query += ` AND m.produto_id = ?`;
            params.push(produto);
        }

        query += ` ORDER BY m.data_movimentacao DESC LIMIT ?`;
        params.push(parseInt(limite));

        const [movimentacoes] = await req.db.execute(query, params);

        res.json(movimentacoes);
    } catch (error) {
        console.error('Erro ao buscar movimentações:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

module.exports = router;