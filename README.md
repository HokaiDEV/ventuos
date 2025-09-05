# Sistema de Almoxarifado - LAJES TAMOYO

Sistema completo de gestão de almoxarifado desenvolvido para LAJES TAMOYO com interface neumórfica moderna e funcionalidades abrangentes.

## 🚀 Características Principais

### Interface Neumórfica
- Design moderno com elementos suaves e extrudidos
- Paleta de cores monocromática com sombras sutis
- Efeitos de pressão em botões e interações
- Responsivo para desktop e mobile

### Funcionalidades Principais
- **Gestão de Produtos**: Cadastro completo com grupos, unidades e controle de estoque
- **Controle de Estoque**: Movimentações, transferências entre locais e ajustes
- **Sistema de Empréstimos**: Controle de empréstimos para colaboradores com prazos
- **Relatórios Avançados**: Exportação em PDF/Excel com dashboards interativos
- **Auditoria Completa**: Trilha de auditoria para todas as operações
- **Autenticação Segura**: Sistema de login com JWT e controle de permissões

## 🛠️ Tecnologias Utilizadas

### Backend
- **Node.js** com Express.js
- **MySQL 8.0** para banco de dados
- **JWT** para autenticação
- **bcryptjs** para criptografia de senhas
- **Multer** para upload de arquivos
- **PDFKit** e **XLSX** para geração de relatórios

### Frontend
- **HTML5** e **CSS3** puro
- **JavaScript ES6+** vanilla
- **Font Awesome** para ícones
- **Google Fonts** (Inter) para tipografia

### Infraestrutura
- **Docker Compose** para orquestração
- **Nginx** como servidor web
- **MySQL** como banco de dados

## 📋 Pré-requisitos

- Docker e Docker Compose instalados
- Mínimo 4GB de RAM disponível
- 10GB de espaço em disco

## 🚀 Instalação e Execução

### 1. Clone o repositório
```bash
git clone <repository-url>
cd almoxarifado
```

### 2. Configure as variáveis de ambiente
```bash
# Edite o arquivo docker-compose.yml se necessário
# As configurações padrão são:
# - MySQL: porta 3306
# - Backend: porta 3000
# - Frontend: porta 80
```

### 3. Execute o sistema
```bash
docker-compose up -d
```

### 4. Acesse o sistema
- **Frontend**: http://localhost
- **Backend API**: http://localhost:3000/api
- **MySQL**: localhost:3306

## 🔐 Credenciais Padrão

### Usuário Administrador
- **Email**: admin@lajestamoyo.com
- **Senha**: admin123

### Usuário Operador
- **Email**: operador@lajestamoyo.com
- **Senha**: operador123

## 📊 Estrutura do Banco de Dados

### Tabelas Principais
- `produtos` - Cadastro de produtos
- `grupos` - Grupos de produtos
- `fornecedores` - Cadastro de fornecedores
- `colaboradores` - Colaboradores da empresa
- `locais_estoque` - Locais de armazenamento
- `estoques` - Controle de estoque por local
- `movimentacoes` - Histórico de movimentações
- `emprestimos` - Sistema de empréstimos
- `transferencias` - Transferências entre locais
- `usuarios` - Usuários do sistema
- `auditoria` - Log de auditoria

## 🔧 Configuração Avançada

### Variáveis de Ambiente
```env
# Backend
NODE_ENV=production
DB_HOST=mysql
DB_USER=almoxarifado
DB_PASSWORD=almoxarifado123
DB_NAME=almoxarifado
JWT_SECRET=your_jwt_secret_key_here

# Frontend
FRONTEND_URL=http://localhost
```

### Backup do Banco de Dados
```bash
# Fazer backup
docker exec almoxarifado_mysql mysqldump -u root -proot123 almoxarifado > backup.sql

# Restaurar backup
docker exec -i almoxarifado_mysql mysql -u root -proot123 almoxarifado < backup.sql
```

## 📱 Funcionalidades por Módulo

### 1. Cadastros
- **Produtos**: Código, descrição, unidade, grupo, estoque mínimo/máximo
- **Fornecedores**: CNPJ/CPF, contatos, condições de compra
- **Colaboradores**: Matrícula, setor, gestor
- **Locais de Estoque**: Endereçamento, responsável

### 2. Estoque
- **Movimentações**: Entradas, saídas, ajustes, devoluções
- **Transferências**: Entre locais com aprovação
- **Controle de Saldos**: Por produto e local
- **Alertas**: Estoque mínimo e rupturas

### 3. Empréstimos
- **Registro**: Empréstimos para colaboradores
- **Controle de Prazos**: Devolução automática
- **Check-in/Check-out**: Controle de entrada e saída
- **Relatórios**: Por colaborador e período

### 4. Relatórios
- **Posição de Estoque**: Saldos atuais por produto
- **Rupturas**: Produtos abaixo do mínimo
- **Movimentações**: Histórico completo
- **Dashboard**: Visão geral do sistema

## 🔒 Segurança

- Autenticação JWT com expiração de 8 horas
- Criptografia de senhas com bcrypt
- Controle de permissões por perfil (admin, usuário, colaborador)
- Trilha de auditoria completa
- Rate limiting para APIs
- Headers de segurança no Nginx

## 📈 Monitoramento

### Health Checks
- **Backend**: http://localhost:3000/api/health
- **Frontend**: http://localhost/health
- **MySQL**: Verificação automática de conexão

### Logs
```bash
# Ver logs do sistema
docker-compose logs -f

# Logs específicos
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f mysql
```

## 🚨 Solução de Problemas

### Problemas Comuns

1. **Erro de conexão com banco**
   ```bash
   # Verificar se MySQL está rodando
   docker-compose ps
   # Reiniciar serviços
   docker-compose restart
   ```

2. **Erro de permissão**
   ```bash
   # Verificar permissões dos volumes
   sudo chown -R $USER:$USER .
   ```

3. **Porta já em uso**
   ```bash
   # Verificar portas em uso
   netstat -tulpn | grep :80
   netstat -tulpn | grep :3000
   netstat -tulpn | grep :3306
   ```

## 📞 Suporte

**Master Vital Soluções**
- **Contato**: Iann Arruda Saçaki
- **Telefone**: (14) 99632-3874
- **Email**: iann@mastervital.com

## 📄 Licença

Este projeto foi desenvolvido exclusivamente para LAJES TAMOYO e é propriedade da Master Vital Soluções.

---

**Versão**: 1.0.0  
**Data**: Dezembro 2024  
**Cliente**: LAJES TAMOYO  
**Desenvolvedor**: Master Vital Soluções