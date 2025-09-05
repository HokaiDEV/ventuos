# Sistema de Almoxarifado - LAJES TAMOYO

Sistema completo de controle de almoxarifado com cadastro de produtos, gestão de estoque, transferências e empréstimos.

## 🏢 Cliente
**LAJES TAMOYO**

## 👨‍💻 Desenvolvedor
**Master Vital Soluções**  
Iann Arruda Saçaki  
Telefone: (14) 99632-3874  
Email: iann@mastervital.com

## 💰 Valor do Projeto
R$ 22.500,00 (3x de R$ 7.500,00)

## 🎯 Objetivo
Desenvolver e implantar um Sistema de Almoxarifado on-premise para controle de produtos e insumos, com cadastros, movimentações, transferências entre locais e módulo de empréstimos para colaboradores.

## ✨ Principais Funcionalidades

### 📦 Cadastro de Produtos
- Código, descrição, unidade, grupo
- Estoque atual, mínimo/máximo
- Estoque requisitado
- Código de barras/QR
- Curva ABC automática
- Múltiplas unidades de medida
- Anexos (fotos, PDFs, fichas técnicas)

### 📊 Gestão de Estoque
- Entradas e saídas
- Movimentações com histórico completo
- Alertas automáticos para estoque baixo
- Inventário rotativo
- Controle multi-local
- Endereçamento por localização

### 🔄 Transferências
- Solicitação entre locais
- Fluxo de aprovação
- Acompanhamento em tempo real
- Histórico completo
- Validação de destino
- Transferências em lote

### 🤝 Empréstimos
- Empréstimos para colaboradores
- Controle de prazo de devolução
- Check-in/check-out
- Notificações automáticas
- Termo de responsabilidade
- Controle de perdas

### 📈 Relatórios e Dashboards
- Relatórios de estoque
- Movimentações por período
- Empréstimos por colaborador
- Transferências entre locais
- Exportação PDF/Excel
- Dashboards interativos

### 🔐 Segurança e Auditoria
- Controle de acesso (RBAC)
- Trilha de auditoria completa
- Autenticação segura
- Logs de todas as operações
- MFA opcional (TOTP/SMS)

## 🛠️ Tecnologias Utilizadas

### Backend
- **Node.js** - Runtime JavaScript
- **Express.js** - Framework web
- **MySQL** - Banco de dados
- **JWT** - Autenticação
- **bcryptjs** - Criptografia de senhas
- **Helmet** - Segurança HTTP
- **Express Rate Limit** - Controle de taxa

### Frontend
- **EJS** - Template engine
- **Neumorphic CSS** - Design system personalizado
- **JavaScript Vanilla** - Interatividade
- **Inter Font** - Tipografia moderna

### Infraestrutura
- **Docker & Docker Compose** - Containerização
- **MySQL 8.0** - Banco de dados
- **Nginx** (opcional) - Proxy reverso
- **Backup automático** - Rotinas de backup

## 🚀 Instalação e Configuração

### Pré-requisitos
- Docker e Docker Compose
- Git

### Instalação com Docker (Recomendado)

1. **Clone o repositório:**
```bash
git clone <repository-url>
cd sistema-almoxarifado
```

2. **Configure as variáveis de ambiente:**
```bash
cp .env.example .env
# Edite o arquivo .env com suas configurações
```

3. **Execute com Docker Compose:**
```bash
docker-compose up -d
```

4. **Acesse o sistema:**
- URL: http://localhost:3000
- Email: admin@lajestamoyo.com
- Senha: admin123

### Instalação Manual

1. **Instale as dependências:**
```bash
npm install
```

2. **Configure o banco de dados:**
```bash
# Execute o script database/init.sql no MySQL
mysql -u root -p < database/init.sql
```

3. **Configure as variáveis de ambiente:**
```bash
cp .env.example .env
# Configure as variáveis de acordo com seu ambiente
```

4. **Execute a aplicação:**
```bash
npm start
```

## 📋 Configuração Inicial

### Usuário Administrador Padrão
- **Email:** admin@lajestamoyo.com
- **Senha:** admin123
- **Perfil:** Administrador

### Primeiros Passos
1. Faça login com as credenciais padrão
2. Altere a senha do administrador
3. Cadastre os grupos de produtos
4. Configure os locais de estoque
5. Cadastre os colaboradores
6. Importe ou cadastre os produtos

## 🔧 Configurações Avançadas

### Backup Automático
O sistema inclui rotinas de backup automático configuráveis:
- Backup diário às 02:00
- Retenção de 30 dias
- Compressão automática
- Notificações por email

### Integração com ERP
- API REST para integração
- Sincronização de produtos
- Atualização de estoques
- Webhooks para notificações

### Personalizações
- Campos customizáveis por categoria
- Relatórios personalizados
- Workflows de aprovação
- Notificações customizadas

## 📱 Recursos Mobile

### App de Coleta (Android)
- Leitura de códigos de barras
- Entrada/saída rápida
- Consulta de estoque
- Transferências móveis

### Interface Responsiva
- Design adaptável
- Touch-friendly
- Offline capability
- PWA ready

## 🔒 Segurança

### Medidas Implementadas
- Criptografia de senhas (bcrypt)
- Proteção contra ataques comuns
- Rate limiting
- Validação de entrada
- Logs de auditoria
- Sessões seguras

### Conformidade
- LGPD compliant
- Auditoria completa
- Controle de acesso granular
- Backup seguro

## 📊 Métricas e Monitoramento

### Dashboard Executivo
- KPIs em tempo real
- Gráficos interativos
- Alertas automáticos
- Tendências de consumo

### Relatórios Gerenciais
- Análise de curva ABC
- Giro de estoque
- Custos por centro
- Performance por usuário

## 🆘 Suporte e Manutenção

### Suporte Técnico
- **Master Vital Soluções**
- **Contato:** Iann Arruda Saçaki
- **Telefone:** (14) 99632-3874
- **Email:** iann@mastervital.com
- **Horário:** Segunda a Sexta, 8h às 18h

### Atualizações
- Atualizações de segurança
- Novas funcionalidades
- Correções de bugs
- Melhorias de performance

### Treinamento
- Manual do usuário
- Vídeos tutoriais
- Treinamento presencial
- Suporte remoto

## 📜 Licença

Este software foi desenvolvido exclusivamente para **LAJES TAMOYO** pela **Master Vital Soluções**.

Todos os direitos reservados. É proibida a distribuição, cópia ou uso não autorizado deste software.

## 🔄 Changelog

### Versão 1.0.0 (2024)
- ✅ Sistema completo de almoxarifado
- ✅ Interface Neumorphic
- ✅ Módulo de produtos
- ✅ Controle de estoque
- ✅ Sistema de transferências
- ✅ Módulo de empréstimos
- ✅ Relatórios completos
- ✅ Auditoria e segurança
- ✅ Deploy on-premise

## 🎯 Roadmap Futuro

### Próximas Funcionalidades
- [ ] App mobile nativo
- [ ] Integração com balanças
- [ ] BI avançado
- [ ] API pública
- [ ] Módulo de compras
- [ ] Gestão de fornecedores
- [ ] Controle de validade
- [ ] Rastreabilidade completa

---

**Sistema desenvolvido com ❤️ pela Master Vital Soluções**

Para suporte técnico ou dúvidas, entre em contato:
- 📱 (14) 99632-3874
- 📧 iann@mastervital.com