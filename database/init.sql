-- Modelo MySQL aprimorado e atualizado com locais, transferências e empréstimos
CREATE DATABASE IF NOT EXISTS almoxarifado CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE almoxarifado;

CREATE TABLE IF NOT EXISTS grupos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    codigo VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS produtos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) NOT NULL UNIQUE,
    descricao VARCHAR(255) NOT NULL,
    unidade VARCHAR(20),
    grupo_id INT,
    estoque_atual INT DEFAULT 0,
    estoque_minimo INT DEFAULT 0,
    estoque_maximo INT DEFAULT 0,
    estoque_requisitado INT DEFAULT 0,
    ativo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_produto_grupo FOREIGN KEY (grupo_id) REFERENCES grupos(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fornecedores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    cnpj_cpf VARCHAR(20),
    contato VARCHAR(255),
    telefone VARCHAR(40),
    email VARCHAR(120),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    senha_hash VARCHAR(255) NOT NULL,
    perfil ENUM('admin','usuario','colaborador') DEFAULT 'usuario',
    ativo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS colaboradores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(120) NOT NULL,
    matricula VARCHAR(40) UNIQUE,
    setor VARCHAR(80),
    gestor VARCHAR(120),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS locais_estoque (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(80) UNIQUE,
    nome VARCHAR(120) NOT NULL,
    endereco VARCHAR(200),
    responsavel VARCHAR(120),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS estoques (
    id INT AUTO_INCREMENT PRIMARY KEY,
    produto_id INT,
    local_id INT,
    quantidade INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_estoque_produto FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE,
    CONSTRAINT fk_estoque_local FOREIGN KEY (local_id) REFERENCES locais_estoque(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS transferencias (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    origem_local_id INT NOT NULL,
    destino_local_id INT NOT NULL,
    status ENUM('pendente','em_transito','concluida','cancelada') DEFAULT 'pendente',
    responsavel VARCHAR(120),
    data_solicitacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_conclusao DATETIME,
    observacao TEXT,
    CONSTRAINT fk_trans_origem FOREIGN KEY (origem_local_id) REFERENCES locais_estoque(id) ON DELETE RESTRICT,
    CONSTRAINT fk_trans_destino FOREIGN KEY (destino_local_id) REFERENCES locais_estoque(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS entradas (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    fornecedor_id INT,
    numero_documento VARCHAR(80),
    data_entrada DATETIME DEFAULT CURRENT_TIMESTAMP,
    usuario_id INT,
    observacao TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_entrada_fornecedor FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id) ON DELETE SET NULL,
    CONSTRAINT fk_entrada_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS entrada_itens (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    entrada_id BIGINT NOT NULL,
    produto_id INT NOT NULL,
    quantidade INT NOT NULL,
    custo DECIMAL(14,2),
    CONSTRAINT fk_entrada_item_entrada FOREIGN KEY (entrada_id) REFERENCES entradas(id) ON DELETE CASCADE,
    CONSTRAINT fk_entrada_item_produto FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS movimentacoes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    produto_id INT NOT NULL,
    tipo ENUM('entrada','saida','ajuste','devolucao','emprestimo_saida','emprestimo_retorno','transferencia') NOT NULL,
    quantidade INT NOT NULL,
    data_movimentacao DATETIME DEFAULT CURRENT_TIMESTAMP,
    usuario_id INT,
    referencia VARCHAR(150),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_mov_produto FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE RESTRICT,
    CONSTRAINT fk_mov_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS emprestimos (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    colaborador_id INT NOT NULL,
    usuario_solicitante INT,
    data_emprestimo DATETIME DEFAULT CURRENT_TIMESTAMP,
    prazo_devolucao DATE,
    data_devolucao DATETIME,
    status ENUM('aberto','devolvido','atrasado','perdido') DEFAULT 'aberto',
    observacao TEXT,
    CONSTRAINT fk_emprest_colab FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id) ON DELETE CASCADE,
    CONSTRAINT fk_emprest_usuario FOREIGN KEY (usuario_solicitante) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS emprestimo_itens (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    emprestimo_id BIGINT NOT NULL,
    produto_id INT NOT NULL,
    quantidade INT NOT NULL,
    qtd_retornada INT DEFAULT 0,
    CONSTRAINT fk_ei_emprestimo FOREIGN KEY (emprestimo_id) REFERENCES emprestimos(id) ON DELETE CASCADE,
    CONSTRAINT fk_ei_produto_emp FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS auditoria (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT,
    acao VARCHAR(120) NOT NULL,
    tabela_afetada VARCHAR(120),
    registro_id BIGINT,
    detalhes JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Inserir dados iniciais
INSERT INTO grupos (nome, codigo) VALUES 
('Ferramentas', 'FERR'),
('Materiais de Construção', 'MAT'),
('Equipamentos de Segurança', 'SEG'),
('Limpeza e Higiene', 'LIM');

INSERT INTO locais_estoque (codigo, nome, endereco, responsavel) VALUES 
('ALM01', 'Almoxarifado Principal', 'Rua A, 123', 'João Silva'),
('ALM02', 'Depósito Secundário', 'Rua B, 456', 'Maria Santos'),
('ALM03', 'Estoque de Obra', 'Obra Central', 'Pedro Costa');

INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES 
('Administrador', 'admin@lajestamoyo.com', '$2b$10$rQZ8K9vL2mN3pQ4rS5tU6uV7wX8yZ9aA0bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP5qQ6rR7sS8tT9uU0vV1wW2xX3yY4zZ5', 'admin'),
('Operador', 'operador@lajestamoyo.com', '$2b$10$rQZ8K9vL2mN3pQ4rS5tU6uV7wX8yZ9aA0bB1cC2dD3eE4fF5gG6hH7iI8jJ9kK0lL1mM2nN3oO4pP5qQ6rR7sS8tT9uU0vV1wW2xX3yY4zZ5', 'usuario');

INSERT INTO colaboradores (nome, matricula, setor, gestor) VALUES 
('Carlos Mendes', '001', 'Produção', 'João Silva'),
('Ana Paula', '002', 'Administrativo', 'Maria Santos'),
('Roberto Lima', '003', 'Manutenção', 'Pedro Costa');