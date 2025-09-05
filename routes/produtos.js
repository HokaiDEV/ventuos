const express = require('express');
const router = express.Router();

// List products
router.get('/', async (req, res) => {
    try {
        const { search, grupo, ativo = '1' } = req.query;
        let query = `
            SELECT p.*, g.nome as grupo_nome 
            FROM produtos p 
            LEFT JOIN grupos g ON p.grupo_id = g.id 
            WHERE 1=1
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

        if (ativo !== 'all') {
            query += ` AND p.ativo = ?`;
            params.push(ativo);
        }

        query += ` ORDER BY p.descricao ASC`;

        const [produtos] = await req.db.execute(query, params);

        // Get groups for filter
        const [grupos] = await req.db.execute('SELECT * FROM grupos WHERE ativo = 1 ORDER BY nome');

        res.render('produtos/index', {
            title: 'Produtos',
            produtos,
            grupos,
            filters: { search, grupo, ativo },
            user: req.user
        });
    } catch (error) {
        console.error('Erro ao listar produtos:', error);
        req.flash('error', 'Erro ao carregar produtos');
        res.redirect('/dashboard');
    }
});

// Show product form
router.get('/novo', async (req, res) => {
    try {
        const [grupos] = await req.db.execute('SELECT * FROM grupos WHERE ativo = 1 ORDER BY nome');
        
        res.render('produtos/form', {
            title: 'Novo Produto',
            produto: null,
            grupos,
            user: req.user
        });
    } catch (error) {
        console.error('Erro ao carregar formulário:', error);
        req.flash('error', 'Erro ao carregar formulário');
        res.redirect('/produtos');
    }
});

// Create product
router.post('/', async (req, res) => {
    try {
        const {
            codigo,
            descricao,
            unidade,
            grupo_id,
            estoque_minimo,
            estoque_maximo,
            codigo_barras,
            preco_custo,
            observacoes
        } = req.body;

        // Validate required fields
        if (!codigo || !descricao) {
            req.flash('error', 'Código e descrição são obrigatórios');
            return res.redirect('/produtos/novo');
        }

        // Check if code already exists
        const [existing] = await req.db.execute('SELECT id FROM produtos WHERE codigo = ?', [codigo]);
        if (existing.length > 0) {
            req.flash('error', 'Código já existe');
            return res.redirect('/produtos/novo');
        }

        // Set audit user
        await req.db.execute('SET @current_user_id = ?', [req.user.id]);

        // Insert product
        const [result] = await req.db.execute(`
            INSERT INTO produtos (
                codigo, descricao, unidade, grupo_id, estoque_minimo, 
                estoque_maximo, codigo_barras, preco_custo, observacoes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            codigo,
            descricao,
            unidade || 'UN',
            grupo_id || null,
            parseInt(estoque_minimo) || 0,
            parseInt(estoque_maximo) || 0,
            codigo_barras || null,
            parseFloat(preco_custo) || 0,
            observacoes || null
        ]);

        req.flash('success', 'Produto cadastrado com sucesso');
        res.redirect(`/produtos/${result.insertId}`);
    } catch (error) {
        console.error('Erro ao criar produto:', error);
        req.flash('error', 'Erro ao cadastrar produto');
        res.redirect('/produtos/novo');
    }
});

// Show product details
router.get('/:id', async (req, res) => {
    try {
        const [produtos] = await req.db.execute(`
            SELECT p.*, g.nome as grupo_nome 
            FROM produtos p 
            LEFT JOIN grupos g ON p.grupo_id = g.id 
            WHERE p.id = ?
        `, [req.params.id]);

        if (produtos.length === 0) {
            req.flash('error', 'Produto não encontrado');
            return res.redirect('/produtos');
        }

        const produto = produtos[0];

        // Get stock by location
        const [estoques] = await req.db.execute(`
            SELECT e.*, l.nome as local_nome, l.codigo as local_codigo
            FROM estoques e
            JOIN locais_estoque l ON e.local_id = l.id
            WHERE e.produto_id = ? AND e.quantidade > 0
            ORDER BY l.nome
        `, [req.params.id]);

        // Get recent movements
        const [movimentacoes] = await req.db.execute(`
            SELECT m.*, u.nome as usuario_nome, l.nome as local_nome
            FROM movimentacoes m
            LEFT JOIN usuarios u ON m.usuario_id = u.id
            LEFT JOIN locais_estoque l ON m.local_id = l.id
            WHERE m.produto_id = ?
            ORDER BY m.data_movimentacao DESC
            LIMIT 10
        `, [req.params.id]);

        res.render('produtos/show', {
            title: `Produto: ${produto.descricao}`,
            produto,
            estoques,
            movimentacoes,
            user: req.user
        });
    } catch (error) {
        console.error('Erro ao carregar produto:', error);
        req.flash('error', 'Erro ao carregar produto');
        res.redirect('/produtos');
    }
});

// Show edit form
router.get('/:id/editar', async (req, res) => {
    try {
        const [produtos] = await req.db.execute('SELECT * FROM produtos WHERE id = ?', [req.params.id]);
        
        if (produtos.length === 0) {
            req.flash('error', 'Produto não encontrado');
            return res.redirect('/produtos');
        }

        const [grupos] = await req.db.execute('SELECT * FROM grupos WHERE ativo = 1 ORDER BY nome');
        
        res.render('produtos/form', {
            title: 'Editar Produto',
            produto: produtos[0],
            grupos,
            user: req.user
        });
    } catch (error) {
        console.error('Erro ao carregar produto para edição:', error);
        req.flash('error', 'Erro ao carregar produto');
        res.redirect('/produtos');
    }
});

// Update product
router.put('/:id', async (req, res) => {
    try {
        const {
            codigo,
            descricao,
            unidade,
            grupo_id,
            estoque_minimo,
            estoque_maximo,
            codigo_barras,
            preco_custo,
            observacoes
        } = req.body;

        // Validate required fields
        if (!codigo || !descricao) {
            req.flash('error', 'Código e descrição são obrigatórios');
            return res.redirect(`/produtos/${req.params.id}/editar`);
        }

        // Check if code already exists (excluding current product)
        const [existing] = await req.db.execute(
            'SELECT id FROM produtos WHERE codigo = ? AND id != ?', 
            [codigo, req.params.id]
        );
        if (existing.length > 0) {
            req.flash('error', 'Código já existe');
            return res.redirect(`/produtos/${req.params.id}/editar`);
        }

        // Set audit user
        await req.db.execute('SET @current_user_id = ?', [req.user.id]);

        // Update product
        await req.db.execute(`
            UPDATE produtos SET 
                codigo = ?, descricao = ?, unidade = ?, grupo_id = ?, 
                estoque_minimo = ?, estoque_maximo = ?, codigo_barras = ?, 
                preco_custo = ?, observacoes = ?
            WHERE id = ?
        `, [
            codigo,
            descricao,
            unidade || 'UN',
            grupo_id || null,
            parseInt(estoque_minimo) || 0,
            parseInt(estoque_maximo) || 0,
            codigo_barras || null,
            parseFloat(preco_custo) || 0,
            observacoes || null,
            req.params.id
        ]);

        req.flash('success', 'Produto atualizado com sucesso');
        res.redirect(`/produtos/${req.params.id}`);
    } catch (error) {
        console.error('Erro ao atualizar produto:', error);
        req.flash('error', 'Erro ao atualizar produto');
        res.redirect(`/produtos/${req.params.id}/editar`);
    }
});

// Toggle product status
router.patch('/:id/toggle', async (req, res) => {
    try {
        // Set audit user
        await req.db.execute('SET @current_user_id = ?', [req.user.id]);

        await req.db.execute(
            'UPDATE produtos SET ativo = NOT ativo WHERE id = ?',
            [req.params.id]
        );

        req.flash('success', 'Status do produto alterado com sucesso');
        res.redirect('/produtos');
    } catch (error) {
        console.error('Erro ao alterar status do produto:', error);
        req.flash('error', 'Erro ao alterar status do produto');
        res.redirect('/produtos');
    }
});

// API endpoints
router.get('/api/search', async (req, res) => {
    try {
        const { q } = req.query;
        
        if (!q || q.length < 2) {
            return res.json([]);
        }

        const [produtos] = await req.db.execute(`
            SELECT id, codigo, descricao, unidade, estoque_atual
            FROM produtos 
            WHERE ativo = 1 
            AND (codigo LIKE ? OR descricao LIKE ?)
            ORDER BY descricao ASC
            LIMIT 10
        `, [`%${q}%`, `%${q}%`]);

        res.json(produtos);
    } catch (error) {
        console.error('Erro na busca de produtos:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

router.get('/api/:id/stock', async (req, res) => {
    try {
        const [estoques] = await req.db.execute(`
            SELECT 
                e.quantidade,
                e.quantidade_reservada,
                l.id as local_id,
                l.nome as local_nome,
                l.codigo as local_codigo
            FROM estoques e
            JOIN locais_estoque l ON e.local_id = l.id
            WHERE e.produto_id = ?
            ORDER BY l.nome
        `, [req.params.id]);

        res.json(estoques);
    } catch (error) {
        console.error('Erro ao buscar estoque do produto:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

module.exports = router;