// Global state
let currentUser = null;
let authToken = null;
let currentModule = 'produtos';
let products = [];
let groups = [];

// API Configuration
const API_BASE_URL = window.location.origin.replace('80', '3000') + '/api';

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    initializeEventListeners();
});

// Check authentication status
function checkAuth() {
    const token = localStorage.getItem('authToken');
    if (token) {
        authToken = token;
        verifyToken();
    } else {
        showLoginScreen();
    }
}

// Verify token with backend
async function verifyToken() {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/verify`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            showMainApp();
            loadInitialData();
        } else {
            localStorage.removeItem('authToken');
            showLoginScreen();
        }
    } catch (error) {
        console.error('Erro ao verificar token:', error);
        localStorage.removeItem('authToken');
        showLoginScreen();
    }
}

// Show login screen
function showLoginScreen() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
}

// Show main application
function showMainApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'grid';
    
    // Update user info
    document.getElementById('user-name').textContent = currentUser.nome;
    
    // Load initial module
    showModule('produtos');
}

// Initialize event listeners
function initializeEventListeners() {
    // Login form
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    
    // Product form
    document.getElementById('product-form').addEventListener('submit', function(e) {
        e.preventDefault();
        saveProduct();
    });
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const loginData = {
        email: formData.get('email'),
        senha: formData.get('senha')
    };

    showLoading(true);

    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(loginData)
        });

        const data = await response.json();

        if (response.ok) {
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('authToken', authToken);
            showMainApp();
            loadInitialData();
            showToast('Login realizado com sucesso!', 'success');
        } else {
            showToast(data.error || 'Erro no login', 'error');
        }
    } catch (error) {
        console.error('Erro no login:', error);
        showToast('Erro de conexão', 'error');
    } finally {
        showLoading(false);
    }
}

// Load initial data
async function loadInitialData() {
    await Promise.all([
        loadGroups(),
        loadProducts()
    ]);
}

// Load groups
async function loadGroups() {
    try {
        const response = await fetch(`${API_BASE_URL}/produtos/grupos/list`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            groups = await response.json();
            updateGroupSelects();
        }
    } catch (error) {
        console.error('Erro ao carregar grupos:', error);
    }
}

// Update group selects
function updateGroupSelects() {
    const selects = document.querySelectorAll('select[id*="grupo"]');
    selects.forEach(select => {
        select.innerHTML = '<option value="">Selecione um grupo</option>';
        groups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = group.nome;
            select.appendChild(option);
        });
    });
}

// Load products
async function loadProducts() {
    try {
        const response = await fetch(`${API_BASE_URL}/produtos`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            products = data.produtos;
            renderProductsTable();
        }
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        showToast('Erro ao carregar produtos', 'error');
    }
}

// Render products table
function renderProductsTable() {
    const tbody = document.getElementById('products-tbody');
    tbody.innerHTML = '';

    products.forEach(product => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${product.codigo}</td>
            <td>${product.descricao}</td>
            <td>${product.unidade || '-'}</td>
            <td>${product.grupo_nome || '-'}</td>
            <td>${product.estoque_atual}</td>
            <td>${product.estoque_minimo}</td>
            <td>${product.estoque_maximo}</td>
            <td>
                <span class="status-badge ${product.ativo ? 'status-active' : 'status-inactive'}">
                    ${product.ativo ? 'Ativo' : 'Inativo'}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn edit" onclick="editProduct(${product.id})" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" onclick="deleteProduct(${product.id})" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Filter products
function filterProducts() {
    const search = document.getElementById('product-search').value.toLowerCase();
    const groupFilter = document.getElementById('group-filter').value;
    const statusFilter = document.getElementById('status-filter').value;

    const filteredProducts = products.filter(product => {
        const matchesSearch = !search || 
            product.codigo.toLowerCase().includes(search) || 
            product.descricao.toLowerCase().includes(search);
        
        const matchesGroup = !groupFilter || product.grupo_id == groupFilter;
        const matchesStatus = statusFilter === '' || product.ativo.toString() === statusFilter;

        return matchesSearch && matchesGroup && matchesStatus;
    });

    // Update table with filtered results
    const tbody = document.getElementById('products-tbody');
    tbody.innerHTML = '';

    filteredProducts.forEach(product => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${product.codigo}</td>
            <td>${product.descricao}</td>
            <td>${product.unidade || '-'}</td>
            <td>${product.grupo_nome || '-'}</td>
            <td>${product.estoque_atual}</td>
            <td>${product.estoque_minimo}</td>
            <td>${product.estoque_maximo}</td>
            <td>
                <span class="status-badge ${product.ativo ? 'status-active' : 'status-inactive'}">
                    ${product.ativo ? 'Ativo' : 'Inativo'}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn edit" onclick="editProduct(${product.id})" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" onclick="deleteProduct(${product.id})" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Show module
function showModule(moduleName) {
    currentModule = moduleName;
    
    // Update navigation
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Show module content
    const contentArea = document.getElementById('content-area');
    contentArea.innerHTML = getModuleContent(moduleName);
    
    // Initialize module-specific functionality
    if (moduleName === 'produtos') {
        loadProducts();
    }
}

// Get module content
function getModuleContent(moduleName) {
    switch (moduleName) {
        case 'produtos':
            return `
                <div id="produtos-module" class="module-content">
                    <div class="module-header">
                        <h2>Gestão de Produtos</h2>
                        <button class="btn btn-primary" onclick="openProductModal()">
                            <i class="fas fa-plus"></i>
                            Novo Produto
                        </button>
                    </div>
                    
                    <div class="filters-card">
                        <div class="filter-group">
                            <label>Buscar</label>
                            <input type="text" id="product-search" placeholder="Código ou descrição..." onkeyup="filterProducts()">
                        </div>
                        <div class="filter-group">
                            <label>Grupo</label>
                            <select id="group-filter" onchange="filterProducts()">
                                <option value="">Todos os grupos</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <label>Status</label>
                            <select id="status-filter" onchange="filterProducts()">
                                <option value="">Todos</option>
                                <option value="true">Ativos</option>
                                <option value="false">Inativos</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="table-card">
                        <div class="table-container">
                            <table id="products-table">
                                <thead>
                                    <tr>
                                        <th>Código</th>
                                        <th>Descrição</th>
                                        <th>Unidade</th>
                                        <th>Grupo</th>
                                        <th>Estoque Atual</th>
                                        <th>Mínimo</th>
                                        <th>Máximo</th>
                                        <th>Status</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody id="products-tbody">
                                    <!-- Products will be loaded here -->
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        default:
            return `
                <div class="module-content">
                    <div class="module-header">
                        <h2>Módulo em Desenvolvimento</h2>
                    </div>
                    <div class="table-card">
                        <p>Este módulo está sendo desenvolvido e estará disponível em breve.</p>
                    </div>
                </div>
            `;
    }
}

// Open product modal
function openProductModal(productId = null) {
    const modal = document.getElementById('product-modal');
    const form = document.getElementById('product-form');
    const title = document.getElementById('modal-title');
    
    if (productId) {
        title.textContent = 'Editar Produto';
        const product = products.find(p => p.id === productId);
        if (product) {
            form.codigo.value = product.codigo;
            form.descricao.value = product.descricao;
            form.unidade.value = product.unidade || '';
            form.grupo_id.value = product.grupo_id || '';
            form.estoque_minimo.value = product.estoque_minimo;
            form.estoque_maximo.value = product.estoque_maximo;
            form.estoque_requisitado.value = product.estoque_requisitado;
            form.ativo.value = product.ativo ? '1' : '0';
        }
    } else {
        title.textContent = 'Novo Produto';
        form.reset();
    }
    
    modal.classList.add('show');
    updateGroupSelects();
}

// Close product modal
function closeProductModal() {
    const modal = document.getElementById('product-modal');
    modal.classList.remove('show');
    document.getElementById('product-form').reset();
}

// Save product
async function saveProduct() {
    const form = document.getElementById('product-form');
    const formData = new FormData(form);
    
    const productData = {
        codigo: formData.get('codigo'),
        descricao: formData.get('descricao'),
        unidade: formData.get('unidade'),
        grupo_id: formData.get('grupo_id') || null,
        estoque_minimo: parseInt(formData.get('estoque_minimo')) || 0,
        estoque_maximo: parseInt(formData.get('estoque_maximo')) || 0,
        estoque_requisitado: parseInt(formData.get('estoque_requisitado')) || 0,
        ativo: formData.get('ativo') === '1'
    };

    const isEdit = form.codigo.dataset.editing === 'true';
    const productId = form.codigo.dataset.productId;

    showLoading(true);

    try {
        const url = isEdit ? `${API_BASE_URL}/produtos/${productId}` : `${API_BASE_URL}/produtos`;
        const method = isEdit ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(productData)
        });

        const data = await response.json();

        if (response.ok) {
            showToast(isEdit ? 'Produto atualizado com sucesso!' : 'Produto criado com sucesso!', 'success');
            closeProductModal();
            loadProducts();
        } else {
            showToast(data.error || 'Erro ao salvar produto', 'error');
        }
    } catch (error) {
        console.error('Erro ao salvar produto:', error);
        showToast('Erro de conexão', 'error');
    } finally {
        showLoading(false);
    }
}

// Edit product
function editProduct(productId) {
    const product = products.find(p => p.id === productId);
    if (product) {
        const form = document.getElementById('product-form');
        form.codigo.dataset.editing = 'true';
        form.codigo.dataset.productId = productId;
        openProductModal(productId);
    }
}

// Delete product
async function deleteProduct(productId) {
    if (!confirm('Tem certeza que deseja excluir este produto?')) {
        return;
    }

    showLoading(true);

    try {
        const response = await fetch(`${API_BASE_URL}/produtos/${productId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        const data = await response.json();

        if (response.ok) {
            showToast('Produto excluído com sucesso!', 'success');
            loadProducts();
        } else {
            showToast(data.error || 'Erro ao excluir produto', 'error');
        }
    } catch (error) {
        console.error('Erro ao excluir produto:', error);
        showToast('Erro de conexão', 'error');
    } finally {
        showLoading(false);
    }
}

// Toggle password visibility
function togglePassword() {
    const passwordInput = document.getElementById('senha');
    const toggleBtn = document.querySelector('.toggle-password i');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleBtn.classList.remove('fa-eye');
        toggleBtn.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        toggleBtn.classList.remove('fa-eye-slash');
        toggleBtn.classList.add('fa-eye');
    }
}

// Toggle sidebar
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('show');
}

// Toggle user menu
function toggleUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    dropdown.classList.toggle('show');
}

// Change password
function changePassword() {
    const currentPassword = prompt('Digite sua senha atual:');
    if (!currentPassword) return;

    const newPassword = prompt('Digite sua nova senha:');
    if (!newPassword || newPassword.length < 6) {
        showToast('Nova senha deve ter pelo menos 6 caracteres', 'error');
        return;
    }

    const confirmPassword = prompt('Confirme sua nova senha:');
    if (newPassword !== confirmPassword) {
        showToast('Senhas não coincidem', 'error');
        return;
    }

    updatePassword(currentPassword, newPassword);
}

// Update password
async function updatePassword(currentPassword, newPassword) {
    showLoading(true);

    try {
        const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                senhaAtual: currentPassword,
                novaSenha: newPassword
            })
        });

        const data = await response.json();

        if (response.ok) {
            showToast('Senha alterada com sucesso!', 'success');
        } else {
            showToast(data.error || 'Erro ao alterar senha', 'error');
        }
    } catch (error) {
        console.error('Erro ao alterar senha:', error);
        showToast('Erro de conexão', 'error');
    } finally {
        showLoading(false);
    }
}

// Logout
async function logout() {
    try {
        await fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
    } catch (error) {
        console.error('Erro no logout:', error);
    } finally {
        localStorage.removeItem('authToken');
        authToken = null;
        currentUser = null;
        showLoginScreen();
        showToast('Logout realizado com sucesso', 'info');
    }
}

// Show loading
function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (show) {
        overlay.classList.add('show');
    } else {
        overlay.classList.remove('show');
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? 'fa-check-circle' :
                 type === 'error' ? 'fa-exclamation-circle' :
                 type === 'warning' ? 'fa-exclamation-triangle' :
                 'fa-info-circle';
    
    toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Remove toast after 5 seconds
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// Close modals when clicking outside
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('show');
    }
    
    if (!e.target.closest('.user-menu')) {
        document.getElementById('user-dropdown').classList.remove('show');
    }
});