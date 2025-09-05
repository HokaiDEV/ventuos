const express = require('express');
const router = express.Router();

// List transfers
router.get('/', async (req, res) => {
    try {
        const { status, search } = req.query;
        
        let query = `
            SELECT 
                t.*,
                lo.nome as origem_nome, lo.codigo as origem_codigo,
                ld.nome as destino_nome, ld.codigo as destino_codigo,
                us.nome as solicitante_nome,
                ua.nome as aprovador_nome
            FROM transferencias t
            JOIN locais_estoque lo ON t.origem_local_id = lo.id
            JOIN locais_estoque ld ON t.destino_local_id = ld.id
            LEFT JOIN usuarios us ON t.solicitante_id = us.id
            LEFT JOIN usuarios ua ON t.aprovador_id = ua.id
            WHERE 1=1
        `;
        const params = [];

        if (status) {
            query += ` AND t.status = ?`;
            params.push(status);
        }

        if (search) {
            query += ` AND (t.codigo LIKE ? OR lo.nome LIKE ? OR ld.nome LIKE ?)`;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        query += ` ORDER BY t.data_solicitacao DESC`;

        const [transferencias] = await req.db.execute(query, params);

        res.render('transferencias/index', {
            title: 'Transferências',
            transferencias,
            filters: { status, search },
            user: req.user
        });
    } catch (error) {
        console.error('Erro ao listar transferências:', error);
        req.flash('error', 'Erro ao carregar transferências');
        res.redirect('/dashboard');
    }
});

// Show new transfer form
router.get('/nova', async (req, res) => {
    try {
        const { produto, origem } = req.query;
        
        const [produtos] = await req.db.execute(`
            SELECT p.*, COALESCE(SUM(e.quantidade), 0) as estoque_total
            FROM produtos p
            LEFT JOIN estoques e ON p.id = e.produto_id
            WHERE p.ativo = 1
            GROUP BY p.id
            HAVING estoque_total > 0
            ORDER BY p.descricao
        `);
        
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

        res.render('transferencias/form', {
            title: 'Nova Transferência',
            transferencia: null,
            produtos,
            locais,
            produtoSelecionado,
            origemSelecionada: origem,
            user: req.user
        });
    } catch (error) {
        console.error('Erro ao carregar formulário de transferência:', error);
        req.flash('error', 'Erro ao carregar formulário');
        res.redirect('/transferencias');
    }
});

// Create transfer
router.post('/', async (req, res) => {
    try {
        const {
            origem_local_id,
            destino_local_id,
            observacao,
            produtos
        } = req.body;

        if (!origem_local_id || !destino_local_id) {
            req.flash('error', 'Local de origem e destino são obrigatórios');
            return res.redirect('/transferencias/nova');
        }

        if (origem_local_id === destino_local_id) {
            req.flash('error', 'Local de origem deve ser diferente do destino');
            return res.redirect('/transferencias/nova');
        }

        if (!produtos || produtos.length === 0) {
            req.flash('error', 'Adicione pelo menos um produto');
            return res.redirect('/transferencias/nova');
        }

        // Start transaction
        await req.db.execute('START TRANSACTION');

        try {
            // Set audit user
            await req.db.execute('SET @current_user_id = ?', [req.user.id]);

            // Generate transfer code
            const transferCode = `TRF${Date.now()}`;

            // Create transfer record
            const [transferResult] = await req.db.execute(`
                INSERT INTO transferencias (
                    codigo, origem_local_id, destino_local_id,
                    solicitante_id, observacao, status
                ) VALUES (?, ?, ?, ?, ?, 'pendente')
            `, [
                transferCode,
                origem_local_id,
                destino_local_id,
                req.user.id,
                observacao || null
            ]);

            const transferId = transferResult.insertId;

            // Process each product
            for (const produtoData of produtos) {
                const { produto_id, quantidade } = produtoData;
                
                if (!produto_id || !quantidade || quantidade <= 0) continue;

                // Check if there's enough stock at origin
                const [stockCheck] = await req.db.execute(`
                    SELECT COALESCE(quantidade, 0) as disponivel
                    FROM estoques 
                    WHERE produto_id = ? AND local_id = ?
                `, [produto_id, origem_local_id]);

                const disponivel = stockCheck[0]?.disponivel || 0;
                if (disponivel < parseInt(quantidade)) {
                    throw new Error(`Estoque insuficiente no local de origem para o produto ID ${produto_id}`);
                }

                // Insert transfer item
                await req.db.execute(`
                    INSERT INTO transferencia_itens (
                        transferencia_id, produto_id, quantidade_solicitada
                    ) VALUES (?, ?, ?)
                `, [transferId, produto_id, parseInt(quantidade)]);

                // Reserve stock at origin
                await req.db.execute(`
                    UPDATE estoques 
                    SET quantidade_reservada = quantidade_reservada + ?
                    WHERE produto_id = ? AND local_id = ?
                `, [parseInt(quantidade), produto_id, origem_local_id]);
            }

            await req.db.execute('COMMIT');

            req.flash('success', `Transferência solicitada com sucesso! Código: ${transferCode}`);
            res.redirect(`/transferencias/${transferId}`);

        } catch (error) {
            await req.db.execute('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Erro ao criar transferência:', error);
        req.flash('error', error.message || 'Erro ao criar transferência');
        res.redirect('/transferencias/nova');
    }
});

// Show transfer details
router.get('/:id', async (req, res) => {
    try {
        const [transferencias] = await req.db.execute(`
            SELECT 
                t.*,
                lo.nome as origem_nome, lo.codigo as origem_codigo,
                ld.nome as destino_nome, ld.codigo as destino_codigo,
                us.nome as solicitante_nome,
                ua.nome as aprovador_nome
            FROM transferencias t
            JOIN locais_estoque lo ON t.origem_local_id = lo.id
            JOIN locais_estoque ld ON t.destino_local_id = ld.id
            LEFT JOIN usuarios us ON t.solicitante_id = us.id
            LEFT JOIN usuarios ua ON t.aprovador_id = ua.id
            WHERE t.id = ?
        `, [req.params.id]);

        if (transferencias.length === 0) {
            req.flash('error', 'Transferência não encontrada');
            return res.redirect('/transferencias');
        }

        const transferencia = transferencias[0];

        // Get transfer items
        const [itens] = await req.db.execute(`
            SELECT ti.*, p.codigo, p.descricao, p.unidade
            FROM transferencia_itens ti
            JOIN produtos p ON ti.produto_id = p.id
            WHERE ti.transferencia_id = ?
            ORDER BY p.descricao
        `, [req.params.id]);

        res.render('transferencias/show', {
            title: `Transferência: ${transferencia.codigo}`,
            transferencia,
            itens,
            user: req.user
        });
    } catch (error) {
        console.error('Erro ao carregar transferência:', error);
        req.flash('error', 'Erro ao carregar transferência');
        res.redirect('/transferencias');
    }
});

// Approve transfer
router.patch('/:id/aprovar', async (req, res) => {
    try {
        // Check if user can approve
        if (req.user.perfil !== 'admin' && req.user.perfil !== 'usuario') {
            req.flash('error', 'Sem permissão para aprovar transferências');
            return res.redirect(`/transferencias/${req.params.id}`);
        }

        await req.db.execute('START TRANSACTION');

        try {
            // Set audit user
            await req.db.execute('SET @current_user_id = ?', [req.user.id]);

            // Update transfer status
            await req.db.execute(`
                UPDATE transferencias 
                SET status = 'aprovada', aprovador_id = ?, data_aprovacao = NOW()
                WHERE id = ? AND status = 'pendente'
            `, [req.user.id, req.params.id]);

            await req.db.execute('COMMIT');

            req.flash('success', 'Transferência aprovada com sucesso');
            res.redirect(`/transferencias/${req.params.id}`);

        } catch (error) {
            await req.db.execute('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Erro ao aprovar transferência:', error);
        req.flash('error', 'Erro ao aprovar transferência');
        res.redirect(`/transferencias/${req.params.id}`);
    }
});

// Complete transfer
router.patch('/:id/concluir', async (req, res) => {
    try {
        await req.db.execute('START TRANSACTION');

        try {
            // Set audit user
            await req.db.execute('SET @current_user_id = ?', [req.user.id]);

            // Get transfer details
            const [transferData] = await req.db.execute(
                'SELECT * FROM transferencias WHERE id = ? AND status IN ("aprovada", "em_transito")',
                [req.params.id]
            );

            if (transferData.length === 0) {
                throw new Error('Transferência não encontrada ou não pode ser concluída');
            }

            const transfer = transferData[0];

            // Get transfer items
            const [itens] = await req.db.execute(
                'SELECT * FROM transferencia_itens WHERE transferencia_id = ?',
                [req.params.id]
            );

            // Process each item
            for (const item of itens) {
                const quantidade = item.quantidade_solicitada;

                // Remove from origin
                await req.db.execute(`
                    UPDATE estoques 
                    SET 
                        quantidade = quantidade - ?,
                        quantidade_reservada = quantidade_reservada - ?
                    WHERE produto_id = ? AND local_id = ?
                `, [quantidade, quantidade, item.produto_id, transfer.origem_local_id]);

                // Add to destination
                await req.db.execute(`
                    INSERT INTO estoques (produto_id, local_id, quantidade)
                    VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE quantidade = quantidade + VALUES(quantidade)
                `, [item.produto_id, transfer.destino_local_id, quantidade]);

                // Update item as completed
                await req.db.execute(`
                    UPDATE transferencia_itens 
                    SET quantidade_enviada = ?, quantidade_recebida = ?
                    WHERE id = ?
                `, [quantidade, quantidade, item.id]);

                // Record movements
                await req.db.execute(`
                    INSERT INTO movimentacoes (
                        produto_id, local_id, tipo, quantidade, 
                        usuario_id, documento_id, referencia
                    ) VALUES (?, ?, 'transferencia_saida', ?, ?, ?, ?)
                `, [
                    item.produto_id,
                    transfer.origem_local_id,
                    -quantidade,
                    req.user.id,
                    req.params.id,
                    transfer.codigo
                ]);

                await req.db.execute(`
                    INSERT INTO movimentacoes (
                        produto_id, local_id, tipo, quantidade, 
                        usuario_id, documento_id, referencia
                    ) VALUES (?, ?, 'transferencia_entrada', ?, ?, ?, ?)
                `, [
                    item.produto_id,
                    transfer.destino_local_id,
                    quantidade,
                    req.user.id,
                    req.params.id,
                    transfer.codigo
                ]);
            }

            // Update transfer status
            await req.db.execute(`
                UPDATE transferencias 
                SET status = 'concluida', data_recebimento = NOW()
                WHERE id = ?
            `, [req.params.id]);

            await req.db.execute('COMMIT');

            req.flash('success', 'Transferência concluída com sucesso');
            res.redirect(`/transferencias/${req.params.id}`);

        } catch (error) {
            await req.db.execute('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Erro ao concluir transferência:', error);
        req.flash('error', error.message || 'Erro ao concluir transferência');
        res.redirect(`/transferencias/${req.params.id}`);
    }
});

// Cancel transfer
router.patch('/:id/cancelar', async (req, res) => {
    try {
        const { motivo } = req.body;

        await req.db.execute('START TRANSACTION');

        try {
            // Set audit user
            await req.db.execute('SET @current_user_id = ?', [req.user.id]);

            // Get transfer details
            const [transferData] = await req.db.execute(
                'SELECT * FROM transferencias WHERE id = ? AND status IN ("pendente", "aprovada")',
                [req.params.id]
            );

            if (transferData.length === 0) {
                throw new Error('Transferência não encontrada ou não pode ser cancelada');
            }

            const transfer = transferData[0];

            // Release reserved stock
            const [itens] = await req.db.execute(
                'SELECT * FROM transferencia_itens WHERE transferencia_id = ?',
                [req.params.id]
            );

            for (const item of itens) {
                await req.db.execute(`
                    UPDATE estoques 
                    SET quantidade_reservada = quantidade_reservada - ?
                    WHERE produto_id = ? AND local_id = ?
                `, [item.quantidade_solicitada, item.produto_id, transfer.origem_local_id]);
            }

            // Update transfer status
            await req.db.execute(`
                UPDATE transferencias 
                SET status = 'cancelada', motivo_cancelamento = ?
                WHERE id = ?
            `, [motivo || 'Cancelamento manual', req.params.id]);

            await req.db.execute('COMMIT');

            req.flash('success', 'Transferência cancelada com sucesso');
            res.redirect(`/transferencias/${req.params.id}`);

        } catch (error) {
            await req.db.execute('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Erro ao cancelar transferência:', error);
        req.flash('error', error.message || 'Erro ao cancelar transferência');
        res.redirect(`/transferencias/${req.params.id}`);
    }
});

module.exports = router;