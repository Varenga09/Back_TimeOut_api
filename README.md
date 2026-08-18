# LocalFood API

API RESTful para pedidos locais dentro de ambientes fechados, como escolas, empresas, fabricas, faculdades, cursos tecnicos e escritorios.

O projeto resolve uma dor comum: vendas locais feitas por WhatsApp, boca a boca ou grupos informais ficam confusas para vendedores e clientes. O LocalFood organiza ambientes, vendedores, produtos e pedidos em uma plataforma simples, sem tentar concorrer com delivery externo.

## Nomes sugeridos

`LocalFood` e um bom nome inicial. Outras possibilidades:

| Nome | Ideia |
| --- | --- |
| PedeLocal | Direto e facil de entender |
| LancheAqui | Bom para escolas e empresas |
| Vitrine Local | Foco em vendedores locais |
| Meu Intervalo | Bom para escolas/faculdades |
| Entrega Interna | Foco em ambientes fechados |

## Visao do Produto

### Problema

Em muitos ambientes fechados sempre existe alguem vendendo salgados, doces, bebidas, marmitas ou lanches. Hoje esses pedidos acontecem por mensagens soltas, grupos e combinados informais. Isso gera:

- Pedidos perdidos.
- Falta de cardapio centralizado.
- Dificuldade para controlar estoque.
- Falta de status do pedido.
- Pouca organizacao para clientes e vendedores.

### Solucao

Uma plataforma simples onde:

- O usuario entra em um ambiente usando codigo de acesso.
- O cliente ve apenas vendedores e produtos daquele ambiente.
- O vendedor cadastra produtos, estoque e preco.
- O cliente faz pedidos e acompanha status.
- O pagamento pode ser online via Pix/cartao ou combinado diretamente com o vendedor.
- A entrega ou retirada acontece dentro do proprio ambiente.

### Publico-alvo

- Alunos de escolas e cursos tecnicos.
- Funcionarios de empresas.
- Trabalhadores de fabricas.
- Vendedores informais de alimentos.
- Cantinas pequenas.
- Pequenos empreendedores locais.

### Diferencial

O LocalFood nao precisa de entregador externo e nao disputa com apps grandes de delivery. Ele e feito para comunidades fechadas, onde cliente e vendedor geralmente ja compartilham o mesmo espaco fisico.

### Funcionalidades principais

- Autenticacao com JWT.
- Ambientes fechados por codigo de acesso.
- Perfis de cliente, vendedor e admin.
- Cadastro e listagem de produtos.
- Categorias.
- Pedidos com multiplos produtos.
- Baixa automatica de estoque ao criar pedido.
- Devolucao de estoque se pedido for cancelado ou recusado.
- Status do pedido.
- Filtros e paginacao.

### Melhorias futuras

- Chat entre cliente e vendedor.
- Avaliacao dos vendedores.
- Notificacoes push.
- QR Code para entrar no ambiente.
- Pagamento Pix integrado.
- Painel web para vendedor.
- Relatorios de vendas.
- Sistema de favoritos.
- Cupons internos.
- Controle de horario de funcionamento do vendedor.

## Tecnologias

| Tecnologia | Uso |
| --- | --- |
| Node.js | Runtime JavaScript |
| Express | Rotas e servidor HTTP |
| MySQL | Banco relacional |
| Sequelize | ORM, models, migrations e seeders |
| JWT | Autenticacao |
| bcrypt | Hash de senhas |
| Joi | Validacao |
| Morgan | Logs HTTP |
| CORS | Controle de origens |
| Multer | Upload opcional de imagens |
| dotenv | Variaveis de ambiente |

## Estrutura

```txt
local-food-api/
|-- src/
|   |-- config/
|   |   |-- database.js
|   |   `-- upload.js
|   |-- controllers/
|   |-- services/
|   |-- repositories/
|   |-- models/
|   |-- routes/
|   |-- middlewares/
|   |-- validations/
|   |-- utils/
|   |-- database/
|   |   |-- migrations/
|   |   `-- seeders/
|   |-- app.js
|   `-- server.js
|-- uploads/
|-- .env.example
|-- .sequelizerc
|-- package.json
`-- README.md
```

## Banco de dados

Banco sugerido:

```txt
local_food_db
```

### Tabelas

- `environments`
- `users`
- `categories`
- `products`
- `orders`
- `order_items`
- `SequelizeMeta`

### Relacionamentos

```txt
Environment hasMany User
User belongsTo Environment

Environment hasMany Product
Product belongsTo Environment

User hasMany Product como seller
Product belongsTo User como seller

Category hasMany Product
Product belongsTo Category

User hasMany Order como customer
User hasMany Order como seller
Order belongsTo User como customer
Order belongsTo User como seller

Environment hasMany Order
Order belongsTo Environment

Order hasMany OrderItem
OrderItem belongsTo Order

Product hasMany OrderItem
OrderItem belongsTo Product
```

## Como instalar

Entre na pasta:

```bash
cd C:\FatecoinsGPT\local-food-api
```

Instale dependencias:

```bash
npm install
```

## Criar o banco MySQL

### Pelo terminal

```bash
mysql -u root -p
```

Depois rode:

```sql
CREATE DATABASE IF NOT EXISTS local_food_db
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

SHOW DATABASES;
USE local_food_db;
SELECT DATABASE();
EXIT;
```

### Pelo MySQL Workbench

1. Abra o MySQL Workbench.
2. Clique na conexao local.
3. Abra uma aba `Query`.
4. Cole:

```sql
CREATE DATABASE IF NOT EXISTS local_food_db
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;
```

5. Clique no raio para executar.
6. No painel `Schemas`, clique em `Refresh All`.
7. Confirme se `local_food_db` apareceu.

## Configurar `.env`

Copie o exemplo:

```bash
copy .env.example .env
```

Edite o `.env`:

```env
PORT=3001
NODE_ENV=development
CORS_ORIGIN=*

DB_HOST=localhost
DB_PORT=3306
DB_NAME=local_food_db
DB_USER=root
DB_PASSWORD=sua_senha
DB_LOGGING=false

JWT_SECRET=sua_chave_secreta
JWT_EXPIRES_IN=1d

UPLOAD_PATH=uploads

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu_email@gmail.com
SMTP_PASSWORD=sua_senha_de_app
MAIL_FROM="LocalFood <seu_email@gmail.com>"
MAIL_APP_NAME=LocalFood
```

Use `PORT=3001` para nao conflitar com o backend de tarefas que usa `3000`.

### Envio de e-mail de verificacao

Para o codigo chegar no e-mail real do usuario, configure SMTP no `.env`.

Exemplo com Gmail:

1. Ative a verificacao em duas etapas na sua conta Google.
2. Crie uma `Senha de app` em `Conta Google > Seguranca > Senhas de app`.
3. Use essa senha em `SMTP_PASSWORD`.
4. Reinicie o backend com `npm run dev`.

Sem SMTP configurado, em `NODE_ENV=development`, a API ainda mostra o codigo na tela para facilitar testes locais. Em producao, configure SMTP obrigatoriamente.

## Migrations

Criar tabelas:

```bash
npm run migrate
```

Desfazer ultima migration:

```bash
npm run migrate:undo
```

Desfazer todas:

```bash
npm run migrate:undo:all
```

## Seeders

Inserir dados iniciais:

```bash
npm run seed
```

O seeder cria:

Ambiente:

```txt
Nome: SENAI Taubate
Codigo: SENAI2026
```

Usuarios:

| Perfil | Email | Senha |
| --- | --- | --- |
| Admin | admin@localfood.com | 123456 |
| Vendedor | vendedor@localfood.com | 123456 |
| Cliente | mateus@localfood.com | 123456 |

Categorias:

```txt
Salgados, Doces, Bebidas, Marmitas, Lanches, Sobremesas, Outros
```

Produtos:

```txt
Coxinha
Suco natural
```

## Iniciar servidor

Desenvolvimento:

```bash
npm run dev
```

Producao/local normal:

```bash
npm start
```

Base URL:

```txt
http://localhost:3001/api/v1
```

Health check:

```txt
GET http://localhost:3001/api/v1/health
```

## Respostas padronizadas

Sucesso:

```json
{
  "success": true,
  "message": "Operacao realizada com sucesso",
  "data": {}
}
```

Erro:

```json
{
  "success": false,
  "message": "Mensagem do erro",
  "error": {}
}
```

## Rotas

### Autenticacao

| Metodo | Rota | Acesso |
| --- | --- | --- |
| POST | `/auth/register` | Publico |
| POST | `/auth/login` | Publico |
| GET | `/auth/me` | JWT |

### Ambientes

| Metodo | Rota | Acesso |
| --- | --- | --- |
| POST | `/environments` | Admin |
| GET | `/environments` | JWT |
| GET | `/environments/:id` | JWT |
| GET | `/environments/:id/users` | Admin do ambiente |
| POST | `/environments/join` | JWT |

### Usuarios

| Metodo | Rota | Acesso |
| --- | --- | --- |
| GET | `/users` | Admin |
| GET | `/users/:id` | Proprio usuario ou admin |
| PUT | `/users/:id` | Proprio usuario ou admin |
| DELETE | `/users/:id` | Admin |

Para trocar foto de perfil em `PUT /users/:id`, use `multipart/form-data` com o campo `profileImage`.

### Vendedores

| Metodo | Rota | Acesso |
| --- | --- | --- |
| POST | `/sellers/request` | JWT |
| PATCH | `/sellers/:id/approve` | Admin |
| PATCH | `/sellers/:id/block` | Admin |

### Categorias

| Metodo | Rota | Acesso |
| --- | --- | --- |
| POST | `/categories` | Admin |
| GET | `/categories` | JWT |
| PUT | `/categories/:id` | Admin |
| DELETE | `/categories/:id` | Admin |

### Produtos

| Metodo | Rota | Acesso |
| --- | --- | --- |
| POST | `/products` | Seller/Admin |
| GET | `/products` | JWT |
| GET | `/products/:id` | JWT |
| PUT | `/products/:id` | Dono/Admin |
| DELETE | `/products/:id` | Dono/Admin |
| PATCH | `/products/:id/status` | Dono/Admin |

### Pedidos

| Metodo | Rota | Acesso |
| --- | --- | --- |
| POST | `/orders` | Cliente/Admin |
| GET | `/orders/my-orders` | Cliente |
| GET | `/orders/seller-orders` | Seller/Admin |
| GET | `/orders/:id` | Cliente, seller dono ou admin |
| PATCH | `/orders/:id/status` | Seller/Admin |
| PATCH | `/orders/:id/cancel` | Cliente dono |

## Exemplos JSON

### Registro

```txt
POST http://localhost:3001/api/v1/auth/register
```

```json
{
  "name": "Mateus",
  "email": "mateus@email.com",
  "password": "123456",
  "phone": "12999999999",
  "environmentAccessCode": "SENAI2026"
}
```

### Login

```txt
POST http://localhost:3001/api/v1/auth/login
```

```json
{
  "email": "mateus@localfood.com",
  "password": "123456"
}
```

Use o token nas rotas privadas:

```txt
Authorization: Bearer token_aqui
```

### Criar ambiente

```txt
POST http://localhost:3001/api/v1/environments
```

```json
{
  "name": "Escola Tecnica SENAI",
  "type": "school",
  "accessCode": "SENAI2026",
  "address": "Taubate - SP"
}
```

### Entrar em ambiente

```txt
POST http://localhost:3001/api/v1/environments/join
```

```json
{
  "accessCode": "SENAI2026"
}
```

### Criar produto

```txt
POST http://localhost:3001/api/v1/products
```

```json
{
  "name": "Coxinha",
  "description": "Coxinha de frango com catupiry",
  "price": 6.5,
  "quantity": 20,
  "categoryId": 1,
  "isActive": true
}
```

Para upload de imagem, use `multipart/form-data` com campo `image`.

### Atualizar produto

```txt
PUT http://localhost:3001/api/v1/products/1
```

Use JSON para alterar informacoes simples:

```json
{
  "name": "Coxinha especial",
  "price": 7.5,
  "quantity": 12,
  "categoryId": 1,
  "isActive": true
}
```

Para trocar a imagem do produto, use `multipart/form-data` com campo `image`.

### Listar produtos

```txt
GET http://localhost:3001/api/v1/products?page=1&limit=10
```

Filtros:

```txt
GET /products?categoryId=1&search=coxinha&minPrice=5&maxPrice=20
GET /products?sellerId=2
```

### Atualizar status de produto

```txt
PATCH http://localhost:3001/api/v1/products/1/status
```

```json
{
  "isActive": false
}
```

### Criar pedido

```txt
POST http://localhost:3001/api/v1/orders
```

```json
{
  "sellerId": 2,
  "paymentMethod": "pix",
  "deliveryType": "meeting_point",
  "deliveryLocation": "Patio principal",
  "observation": "Entregar no intervalo",
  "items": [
    {
      "productId": 1,
      "quantity": 2
    },
    {
      "productId": 2,
      "quantity": 1
    }
  ]
}
```

### Listar pedidos do cliente

```txt
GET http://localhost:3001/api/v1/orders/my-orders?page=1&limit=10
```

### Listar pedidos recebidos pelo vendedor

```txt
GET http://localhost:3001/api/v1/orders/seller-orders?status=pending
```

### Atualizar status do pedido

```txt
PATCH http://localhost:3001/api/v1/orders/1/status
```

```json
{
  "status": "preparing"
}
```

### Cancelar pedido

```txt
PATCH http://localhost:3001/api/v1/orders/1/cancel
```

## Status de pedido

| Status | Significado |
| --- | --- |
| `pending` | Pedido enviado, aguardando vendedor |
| `accepted` | Pedido aceito |
| `preparing` | Pedido em preparo |
| `ready` | Pedido pronto |
| `delivered` | Pedido entregue |
| `canceled` | Pedido cancelado pelo cliente |
| `refused` | Pedido recusado pelo vendedor |

## Formas de pagamento

| Valor | Significado |
| --- | --- |
| `cash` | Dinheiro |
| `pix` | Pix |
| `credit_card` | Cartao de credito via checkout seguro |
| `debit_card` | Cartao de debito via checkout seguro |
| `card_in_person` | Cartao presencial |
| `arrange_with_seller` | Combinar com vendedor |

O vendedor pode ativar ou desativar as formas de pagamento em `GET/PUT /api/v1/payments/settings`.

Pagamentos online usam Mercado Pago:

- Pix gera QR Code dinamico com o valor exato do pedido.
- Cartao de credito e debito usam checkout seguro do gateway.
- O pedido fica com `paymentStatus=awaiting_payment` ate o webhook confirmar o pagamento integral.
- Pagamento parcial, recusado ou cancelado nao libera o pedido.

Variaveis necessarias no `.env`:

```env
MERCADO_PAGO_ACCESS_TOKEN=seu_access_token
MERCADO_PAGO_WEBHOOK_SECRET=seu_segredo_do_webhook
MERCADO_PAGO_WEBHOOK_URL=http://localhost:3001/api/v1/payments/webhooks/mercado-pago
CHECKOUT_SUCCESS_URL=http://localhost:5173/
CHECKOUT_PENDING_URL=http://localhost:5173/
CHECKOUT_FAILURE_URL=http://localhost:5173/
```

Webhook Mercado Pago:

```txt
POST http://localhost:3001/api/v1/payments/webhooks/mercado-pago
```

## Tipos de entrega

| Valor | Significado |
| --- | --- |
| `pickup` | Retirar com o vendedor |
| `internal_delivery` | Entrega interna pelo vendedor |
| `meeting_point` | Combinar ponto de encontro |

## Paginacao

Listagens aceitam:

```txt
?page=1&limit=10
```

O limite maximo por pagina e 100.

## Regras de negocio principais

- Usuario ve apenas dados do proprio ambiente.
- Cliente ve apenas produtos ativos e com estoque.
- Vendedor cadastra produtos apenas no proprio ambiente.
- Vendedor altera apenas os proprios produtos.
- Cliente so ve os proprios pedidos.
- Vendedor so ve pedidos feitos para ele.
- Admin ve e gerencia dados do proprio ambiente.
- Produto inativo nao aparece para clientes.
- Produto sem estoque nao pode ser comprado.
- Ao criar pedido, o estoque e reduzido.
- Ao cancelar ou recusar pedido, o estoque e devolvido.
- Pedido entregue, cancelado ou recusado nao pode ser alterado.
- Pedido cancelado nao pode ser entregue.

## Ordem sugerida para testar no Postman/Thunder Client

1. Rode `npm run migrate`.
2. Rode `npm run seed`.
3. Login como cliente:

```json
{
  "email": "mateus@localfood.com",
  "password": "123456"
}
```

4. Liste produtos.
5. Crie pedido.
6. Login como vendedor:

```json
{
  "email": "vendedor@localfood.com",
  "password": "123456"
}
```

7. Liste pedidos recebidos.
8. Atualize status.
9. Login como admin para testar usuarios, ambientes e categorias.

## Observacoes de seguranca

- Senhas nunca sao retornadas nas respostas.
- Senhas usam hash bcrypt.
- Rotas privadas usam JWT.
- Role middleware protege rotas administrativas.
- As queries sempre consideram `environmentId` do usuario autenticado.
- Em producao, configure `CORS_ORIGIN` com dominios reais.
- Use `JWT_SECRET` longo e privado.

## Licenca

ISC
