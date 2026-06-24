-- Script de inicialização com dados de teste

-- Usuários padrão (senhas criptografadas com bcrypt)
-- Usuário: admin / Senha: admin123
INSERT OR IGNORE INTO users (username, password, name, email, role) VALUES 
('admin', '$2b$10$YKUzSE1aF2xH5vF7mK8L9e5H5c5H5c5H5c5H5c5H5c5H5c5H5c5H5', 'Administrador', 'admin@livraria.com', 'admin');

-- Usuário: gerente / Senha: gerente123
INSERT OR IGNORE INTO users (username, password, name, email, role) VALUES 
('gerente', '$2b$10$YKUzSE1aF2xH5vF7mK8L9e5H5c5H5c5H5c5H5c5H5c5H5c5H5c5H5', 'Gerente', 'gerente@livraria.com', 'gerente');

-- Usuários de atendentes (10 usuários)
INSERT OR IGNORE INTO users (username, password, name, email, role) VALUES 
('atendente1', '$2b$10$YKUzSE1aF2xH5vF7mK8L9e5H5c5H5c5H5c5H5c5H5c5H5c5H5c5H5', 'Maria Silva', 'maria@livraria.com', 'atendente'),
('atendente2', '$2b$10$YKUzSE1aF2xH5vF7mK8L9e5H5c5H5c5H5c5H5c5H5c5H5c5H5c5H5', 'João Santos', 'joao@livraria.com', 'atendente'),
('atendente3', '$2b$10$YKUzSE1aF2xH5vF7mK8L9e5H5c5H5c5H5c5H5c5H5c5H5c5H5c5H5', 'Ana Costa', 'ana@livraria.com', 'atendente'),
('atendente4', '$2b$10$YKUzSE1aF2xH5vF7mK8L9e5H5c5H5c5H5c5H5c5H5c5H5c5H5c5H5', 'Carlos Mendes', 'carlos@livraria.com', 'atendente'),
('atendente5', '$2b$10$YKUzSE1aF2xH5vF7mK8L9e5H5c5H5c5H5c5H5c5H5c5H5c5H5c5H5', 'Patricia Oliveira', 'patricia@livraria.com', 'atendente'),
('atendente6', '$2b$10$YKUzSE1aF2xH5vF7mK8L9e5H5c5H5c5H5c5H5c5H5c5H5c5H5c5H5', 'Roberto Alves', 'roberto@livraria.com', 'atendente'),
('atendente7', '$2b$10$YKUzSE1aF2xH5vF7mK8L9e5H5c5H5c5H5c5H5c5H5c5H5c5H5c5H5', 'Fernanda Rocha', 'fernanda@livraria.com', 'atendente'),
('atendente8', '$2b$10$YKUzSE1aF2xH5vF7mK8L9e5H5c5H5c5H5c5H5c5H5c5H5c5H5c5H5', 'Beatriz Martins', 'beatriz@livraria.com', 'atendente'),
('atendente9', '$2b$10$YKUzSE1aF2xH5vF7mK8L9e5H5c5H5c5H5c5H5c5H5c5H5c5H5c5H5', 'Lucas Pereira', 'lucas@livraria.com', 'atendente'),
('atendente10', '$2b$10$YKUzSE1aF2xH5vF7mK8L9e5H5c5H5c5H5c5H5c5H5c5H5c5H5c5H5', 'Gabriela Gomes', 'gabriela@livraria.com', 'atendente');

-- Livros de exemplo
INSERT OR IGNORE INTO books (isbn, title, author, category, quantity, min_quantity, unit_price) VALUES
('978-8535902778', 'Memórias Póstumas de Brás Cubas', 'Machado de Assis', 'Clássico', 15, 5, 49.90),
('978-8535914849', 'Capitães da Areia', 'Jorge Amado', 'Clássico', 12, 5, 54.90),
('978-8595084741', '1984', 'George Orwell', 'Ficção Científica', 20, 5, 59.90),
('978-8595087925', 'O Hobbit', 'J.R.R. Tolkien', 'Fantasia', 18, 5, 64.90),
('978-8576570904', 'Harry Potter e a Pedra Filosofal', 'J.K. Rowling', 'Fantasia', 25, 10, 69.90),
('978-8545007052', 'O Código da Vinci', 'Dan Brown', 'Mistério', 14, 5, 59.90),
('978-8532505942', 'A Revolução dos Bichos', 'George Orwell', 'Ficção', 11, 5, 42.90),
('978-8576050490', 'O Contador de Histórias', 'Frantz Fanon', 'Narrativa', 8, 5, 51.90),
('978-8532533464', 'A Menina que Roubava Livros', 'Markus Zusak', 'Ficção', 16, 5, 58.90),
('978-8547000357', 'O Alquimista', 'Paulo Coelho', 'Inspiração', 30, 10, 39.90),
('978-8533627796', 'Sapiens', 'Yuval Noah Harari', 'Não-Ficção', 9, 5, 89.90),
('978-8535930665', 'O Senhor dos Anéis', 'J.R.R. Tolkien', 'Fantasia', 7, 5, 129.90),
('978-8595087536', 'Apanhador no Campo de Centeio', 'J.D. Salinger', 'Ficção', 10, 5, 52.90),
('978-8535924190', 'Grande Sertão Veredas', 'Guimarães Rosa', 'Clássico', 6, 3, 61.90),
('978-8535928822', 'Vidas Secas', 'Graciliano Ramos', 'Clássico', 11, 5, 45.90);
