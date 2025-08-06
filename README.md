# BOTEQUIM Delivery

Este repositório contém um protótipo inicial do aplicativo **BOTEQUIM Delivery**, um sistema de pedidos para o restaurante e bar BOTEQUIM de Marília - SP.

## Estrutura

- `backend/` – Servidor Node.js com API de cardápio, login e criação de pedidos.
- `mobile/` – Exemplo simples de aplicativo React Native (Expo) exibindo itens do cardápio.

## Executar o backend

```bash
cd backend
npm install
npm start
```

Endpoints disponíveis:

- `GET /menu` – retorna os itens do cardápio em JSON.
- `POST /auth/login` – autenticação fictícia (retorna token dummy).
- `POST /orders` – cria um pedido fictício.

Este é apenas um ponto de partida simplificado. Funcionalidades completas de autenticação, pagamento, impressão e acompanhamento de pedidos ainda precisam ser implementadas.
