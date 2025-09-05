#!/bin/bash

# Sistema de Almoxarifado - LAJES TAMOYO
# Script de inicialização
# Master Vital Soluções - Iann Arruda Saçaki

echo "🏢 Sistema de Almoxarifado - LAJES TAMOYO"
echo "👨‍💻 Master Vital Soluções - Iann Arruda Saçaki"
echo "📞 (14) 99632-3874 | iann@mastervital.com"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚙️ Criando arquivo de configuração..."
    cp .env.example .env
    echo "✅ Arquivo .env criado. Configure as variáveis antes de prosseguir."
    echo ""
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker não encontrado. Instale o Docker para continuar."
    echo "📖 Visite: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose não encontrado. Instale o Docker Compose para continuar."
    echo "📖 Visite: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "🔧 Iniciando containers..."
docker-compose up -d

echo ""
echo "⏳ Aguardando inicialização dos serviços..."
sleep 10

echo ""
echo "🎉 Sistema iniciado com sucesso!"
echo ""
echo "🌐 Acesse o sistema em: http://localhost:3000"
echo "📧 Email padrão: admin@lajestamoyo.com"
echo "🔑 Senha padrão: admin123"
echo ""
echo "📋 Para verificar os logs:"
echo "   docker-compose logs -f"
echo ""
echo "🛑 Para parar o sistema:"
echo "   docker-compose down"
echo ""
echo "💾 Para fazer backup:"
echo "   docker-compose exec mysql mysqldump -u root -p almoxarifado > backup.sql"
echo ""
echo "✨ Sistema desenvolvido pela Master Vital Soluções"