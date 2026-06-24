FROM node:18-alpine

WORKDIR /app

# Copiar package.json e instalar dependências
COPY package*.json ./
RUN npm install

# Copiar código da aplicação
COPY . .

# Expor porta
EXPOSE 5000

# Comando para iniciar
CMD ["npm", "start"]
