-- Sistema de Almoxarifado - LAJES TAMOYO
-- Modelo MySQL aprimorado com locais, transferências e empréstimos

CREATE DATABASE IF NOT EXISTS almoxarifado CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE almoxarifado;

-- Tabela de grupos de produtos
CREATE TABLE IF NOT EXISTS grupos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    codigo VARCHAR(50),
    descricao TEXT,
    ativo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Tabela de produtos
CREATE TABLE IF NOT EXISTS produtos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) NOT NULL UNIQUE,
    descricao VARCHAR(255) NOT NULL,
    unidade VARCHAR(20) DEFAULT 'UN',
    grupo_id INT,
    estoque_atual INT DEFAULT 0,
    estoque_minimo INT DEFAULT 0,
    estoque_maximo INT DEFAULT 0,
    estoque_requisitado INT DEFAULT 0,
    codigo_barras VARCHAR(100),
    preco_custo DECIMAL(10,2) DEFAULT 0.00,
    observacoes TEXT,
    ativo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_produto_grupo FOREIGN KEY (grupo_id) REFERENCES grupos(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Tabela de fornecedores
CREATE TABLE IF NOT EXISTS fornecedores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    cnpj_cpf VARCHAR(20),
    contato VARCHAR(255),
    telefone VARCHAR(40),
    email VARCHAR(120),
    endereco TEXT,
    prazo_entrega INT DEFAULT 0,
    lote_minimo INT DEFAULT 1,
    ativo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    perfil ENUM('admin','usuario','colaborador','visualizador') DEFAULT 'usuario',
    ultimo_login TIMESTAMP NULL,
    tentativas_login INT DEFAULT 0,
    bloqueado_ate TIMESTAMP NULL,
    ativo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Tabela de colaboradores (requisitantes)
CREATE TABLE IF NOT EXISTS colaboradores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    matricula VARCHAR(40) UNIQUE,
    setor VARCHAR(80),
    gestor VARCHAR(120),
    email VARCHAR(120),
    telefone VARCHAR(40),
    ativo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Tabela de locais de estoque
CREATE TABLE IF NOT EXISTS locais_estoque (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(80) UNIQUE NOT NULL,
    nome VARCHAR(120) NOT NULL,
    endereco VARCHAR(200),
    corredor VARCHAR(20),
    prateleira VARCHAR(20),
    nivel VARCHAR(20),
    capacidade_maxima INT DEFAULT 0,
    responsavel VARCHAR(120),
    tipo ENUM('deposito','almoxarifado','prateleira','box') DEFAULT 'deposito',
    ativo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Tabela de estoques por local
CREATE TABLE IF NOT EXISTS estoques (
    id INT AUTO_INCREMENT PRIMARY KEY,
    produto_id INT NOT NULL,
    local_id INT NOT NULL,
    quantidade INT NOT NULL DEFAULT 0,
    quantidade_reservada INT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_estoque_produto FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE,
    CONSTRAINT fk_estoque_local FOREIGN KEY (local_id) REFERENCES locais_estoque(id) ON DELETE CASCADE,
    UNIQUE KEY unique_produto_local (produto_id, local_id)
) ENGINE=InnoDB;

-- Tabela de transferências
CREATE TABLE IF NOT EXISTS transferencias (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    origem_local_id INT NOT NULL,
    destino_local_id INT NOT NULL,
    status ENUM('pendente','aprovada','em_transito','concluida','cancelada') DEFAULT 'pendente',
    solicitante_id INT,
    aprovador_id INT,
    responsavel_transporte VARCHAR(120),
    data_solicitacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_aprovacao DATETIME NULL,
    data_envio DATETIME NULL,
    data_recebimento DATETIME NULL,
    observacao TEXT,
    motivo_cancelamento TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_trans_origem FOREIGN KEY (origem_local_id) REFERENCES locais_estoque(id) ON DELETE RESTRICT,
    CONSTRAINT fk_trans_destino FOREIGN KEY (destino_local_id) REFERENCES locais_estoque(id) ON DELETE RESTRICT,
    CONSTRAINT fk_trans_solicitante FOREIGN KEY (solicitante_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    CONSTRAINT fk_trans_aprovador FOREIGN KEY (aprovador_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Tabela de itens de transferência
CREATE TABLE IF NOT EXISTS transferencia_itens (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    transferencia_id BIGINT NOT NULL,
    produto_id INT NOT NULL,
    quantidade_solicitada INT NOT NULL,
    quantidade_enviada INT DEFAULT 0,
    quantidade_recebida INT DEFAULT 0,
    observacao TEXT,
    CONSTRAINT fk_ti_transferencia FOREIGN KEY (transferencia_id) REFERENCES transferencias(id) ON DELETE CASCADE,
    CONSTRAINT fk_ti_produto FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Tabela de entradas
CREATE TABLE IF NOT EXISTS entradas (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    fornecedor_id INT,
    numero_documento VARCHAR(80),
    tipo_documento ENUM('nf','recibo','interno') DEFAULT 'interno',
    data_entrada DATETIME DEFAULT CURRENT_TIMESTAMP,
    usuario_id INT,
    local_destino_id INT,
    valor_total DECIMAL(12,2) DEFAULT 0.00,
    observacao TEXT,
    status ENUM('pendente','conferida','finalizada') DEFAULT 'pendente',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_entrada_fornecedor FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id) ON DELETE SET NULL,
    CONSTRAINT fk_entrada_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    CONSTRAINT fk_entrada_local FOREIGN KEY (local_destino_id) REFERENCES locais_estoque(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Tabela de itens de entrada
CREATE TABLE IF NOT EXISTS entrada_itens (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    entrada_id BIGINT NOT NULL,
    produto_id INT NOT NULL,
    quantidade_solicitada INT NOT NULL,
    quantidade_recebida INT DEFAULT 0,
    custo_unitario DECIMAL(10,2) DEFAULT 0.00,
    lote VARCHAR(50),
    data_validade DATE,
    observacao TEXT,
    CONSTRAINT fk_ei_entrada FOREIGN KEY (entrada_id) REFERENCES entradas(id) ON DELETE CASCADE,
    CONSTRAINT fk_ei_produto FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Tabela de movimentações (histórico geral)
CREATE TABLE IF NOT EXISTS movimentacoes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    produto_id INT NOT NULL,
    local_id INT,
    tipo ENUM('entrada','saida','ajuste','devolucao','emprestimo_saida','emprestimo_retorno','transferencia_saida','transferencia_entrada','inventario') NOT NULL,
    quantidade INT NOT NULL,
    quantidade_anterior INT DEFAULT 0,
    quantidade_atual INT DEFAULT 0,
    custo_unitario DECIMAL(10,2) DEFAULT 0.00,
    data_movimentacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    usuario_id INT,
    documento_id BIGINT,
    referencia VARCHAR(150),
    observacao TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_mov_produto FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE RESTRICT,
    CONSTRAINT fk_mov_local FOREIGN KEY (local_id) REFERENCES locais_estoque(id) ON DELETE SET NULL,
    CONSTRAINT fk_mov_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Tabela de empréstimos
CREATE TABLE IF NOT EXISTS emprestimos (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    colaborador_id INT NOT NULL,
    usuario_solicitante_id INT,
    usuario_autorizador_id INT,
    data_emprestimo DATETIME DEFAULT CURRENT_TIMESTAMP,
    prazo_devolucao DATE NOT NULL,
    data_devolucao DATETIME NULL,
    status ENUM('aberto','parcialmente_devolvido','devolvido','atrasado','perdido','cancelado') DEFAULT 'aberto',
    observacao TEXT,
    termo_responsabilidade TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_emprest_colab FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE,
    CONSTRAINT fk_emprest_solicitante FOREIGN KEY (usuario_solicitante_id) REFERENCES usuarios(id) ON DELETE SET NULL,
    CONSTRAINT fk_emprest_autorizador FOREIGN KEY (usuario_autorizador_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Tabela de itens de empréstimo
CREATE TABLE IF NOT EXISTS emprestimo_itens (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    emprestimo_id BIGINT NOT NULL,
    produto_id INT NOT NULL,
    local_origem_id INT,
    quantidade_emprestada INT NOT NULL,
    quantidade_devolvida INT DEFAULT 0,
    condicao_saida ENUM('novo','usado','danificado') DEFAULT 'usado',
    condicao_retorno ENUM('novo','usado','danificado','perdido') NULL,
    observacao_saida TEXT,
    observacao_retorno TEXT,
    data_devolucao_item DATETIME NULL,
    CONSTRAINT fk_ei_emprestimo FOREIGN KEY (emprestimo_id) REFERENCES emprestimos(id) ON DELETE CASCADE,
    CONSTRAINT fk_ei_produto_emp FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE RESTRICT,
    CONSTRAINT fk_ei_local_origem FOREIGN KEY (local_origem_id) REFERENCES locais_estoque(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Tabela de auditoria
CREATE TABLE IF NOT EXISTS auditoria (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT,
    acao VARCHAR(120) NOT NULL,
    tabela_afetada VARCHAR(120),
    registro_id BIGINT,
    dados_anteriores JSON,
    dados_novos JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Tabela de anexos
CREATE TABLE IF NOT EXISTS anexos (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tipo_registro ENUM('produto','entrada','transferencia','emprestimo') NOT NULL,
    registro_id BIGINT NOT NULL,
    nome_arquivo VARCHAR(255) NOT NULL,
    nome_original VARCHAR(255) NOT NULL,
    tipo_arquivo VARCHAR(100),
    tamanho_arquivo BIGINT,
    caminho_arquivo VARCHAR(500) NOT NULL,
    usuario_upload_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_anexo_usuario FOREIGN KEY (usuario_upload_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Tabela de notificações
CREATE TABLE IF NOT EXISTS notificacoes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    tipo ENUM('emprestimo_vencido','estoque_baixo','transferencia_pendente','aprovacao_necessaria') NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    mensagem TEXT NOT NULL,
    registro_relacionado_id BIGINT,
    lida TINYINT(1) DEFAULT 0,
    data_leitura TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notif_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Índices para otimização
CREATE INDEX idx_produtos_codigo ON produtos(codigo);
CREATE INDEX idx_produtos_descricao ON produtos(descricao);
CREATE INDEX idx_produtos_grupo ON produtos(grupo_id);
CREATE INDEX idx_movimentacoes_produto ON movimentacoes(produto_id);
CREATE INDEX idx_movimentacoes_data ON movimentacoes(data_movimentacao);
CREATE INDEX idx_movimentacoes_tipo ON movimentacoes(tipo);
CREATE INDEX idx_emprestimos_status ON emprestimos(status);
CREATE INDEX idx_emprestimos_prazo ON emprestimos(prazo_devolucao);
CREATE INDEX idx_transferencias_status ON transferencias(status);
CREATE INDEX idx_auditoria_data ON auditoria(created_at);
CREATE INDEX idx_notificacoes_usuario ON notificacoes(usuario_id, lida);

-- Inserir dados iniciais
INSERT INTO grupos (nome, codigo, descricao) VALUES 
('Ferramentas', 'FERR', 'Ferramentas e equipamentos'),
('Material de Escritório', 'ESCR', 'Materiais de escritório e papelaria'),
('EPI', 'EPI', 'Equipamentos de Proteção Individual'),
('Material de Limpeza', 'LIMP', 'Produtos de limpeza e higiene'),
('Eletrônicos', 'ELET', 'Equipamentos eletrônicos e informática');

INSERT INTO locais_estoque (codigo, nome, endereco, tipo) VALUES 
('ALMOX-01', 'Almoxarifado Principal', 'Galpão A - Rua 1', 'almoxarifado'),
('DEP-FERR', 'Depósito de Ferramentas', 'Galpão B - Rua 2', 'deposito'),
('ESCR-01', 'Estoque Escritório', 'Sala 101 - Administrativo', 'prateleira');

-- Criar usuário administrador padrão (senha: admin123)
INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES 
('Administrador', 'admin@lajestamoyo.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj1yGPO1gGOG', 'admin');

-- Triggers para auditoria automática
DELIMITER //

CREATE TRIGGER tr_produtos_audit_insert AFTER INSERT ON produtos
FOR EACH ROW
BEGIN
    INSERT INTO auditoria (usuario_id, acao, tabela_afetada, registro_id, dados_novos)
    VALUES (@current_user_id, 'INSERT', 'produtos', NEW.id, JSON_OBJECT(
        'codigo', NEW.codigo,
        'descricao', NEW.descricao,
        'unidade', NEW.unidade,
        'grupo_id', NEW.grupo_id
    ));
END//

CREATE TRIGGER tr_produtos_audit_update AFTER UPDATE ON produtos
FOR EACH ROW
BEGIN
    INSERT INTO auditoria (usuario_id, acao, tabela_afetada, registro_id, dados_anteriores, dados_novos)
    VALUES (@current_user_id, 'UPDATE', 'produtos', NEW.id, 
        JSON_OBJECT(
            'codigo', OLD.codigo,
            'descricao', OLD.descricao,
            'estoque_atual', OLD.estoque_atual
        ),
        JSON_OBJECT(
            'codigo', NEW.codigo,
            'descricao', NEW.descricao,
            'estoque_atual', NEW.estoque_atual
        )
    );
END//

DELIMITER ;