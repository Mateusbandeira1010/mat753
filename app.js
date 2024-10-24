const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const exphbs = require('express-handlebars');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2');
const path = require('path');
const fs = require('fs');
const Chart = require('chart.js');
const { error } = require('console');

const app = express();
const port = process.env.PORT || 3000;

// Configuração do banco de dados
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '753753',
  database: 'cliente',
});


db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
  } else {
    console.log('Connected to MySQL');
  }
});


const sessionStore = new MySQLStore({
  expiration: 86400000,
  endConnectionOnClose: false,
}, db);

app.use(session({
  secret: 'anysecret',
  resave: false,
  saveUninitialized: true,
  store: sessionStore,
}));


app.engine('handlebars', exphbs.engine({
  extname: 'handlebars',
  defaultLayout: 'main',
  layoutsDir: __dirname + '/views/layouts/',
}));
app.set('view engine', 'handlebars');

app.use(express.static('public'));


app.use(express.static('public', {
  setHeaders: (res, path, stat) => {
    if (path.endsWith('.js')) {
      res.set('Content-Type', 'application/javascript');
    }
  },
}));

app.use((req, res, next) => {
  if (req.url.endsWith('.js')) {
    res.setHeader('Content-Type', 'application/javascript');
  }
  next();
});


app.use((req, res, next) => {
  res.locals.successMessage = req.session.successMessage;
  res.locals.errorMessage = req.session.errorMessage;
  delete req.session.successMessage;
  delete req.session.errorMessage;
  next();
});

app.use(express.urlencoded({ extended: true }));

//rota raiz
app.get('/', (req, res) => {
  const isAuthenticated = req.session.email ? true : false; 
  if (!isAuthenticated) {
    req.session.errorMessage = 'Por favor, faça login primeiro para acessar sua página de Cadastramento de Clientes ou DashBoard.';
      return res.redirect('/loginCad');
  }

  const sql = 'SELECT * FROM clientes WHERE user_id = ?';
  const userId = req.session.userId;

  // Executa a consulta SQL
  db.query(sql, [userId], (err, results) => {
      if (err) {
          console.error('Error querying clients:', err);
          req.session.errorMessage = 'Erro ao buscar clientes. Tente novamente.';
          res.redirect('/');
      } else {
          const clientes = results.map(cliente => {
              const valorTotal = parseFloat(cliente.parcela1) + parseFloat(cliente.parcela2) + parseFloat(cliente.parcela3) + parseFloat(cliente.parcela4) + parseFloat(cliente.parcela5);
              const valorRestante = parseFloat(cliente.valorRestante);
              return { ...cliente, valorTotal, valorRestante };
          });

          const totalValorTodosCadastros = clientes.reduce((total, cliente) => total + cliente.valorTotal, 0);

          res.render('home', { 
              isAuthenticated: true, 
              name: req.session.name, 
              clientes: clientes, 
              totalValorTodosCadastros: totalValorTodosCadastros, 
              success: false 
          });
      }
  });
});





app.get('/loginCad', (req, res) => {
  const isAuthenticated = req.session.email ? true : false;
  res.render('loginCad', { isAuthenticated });
});

// Lógica de autenticação
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  const sql = 'SELECT id, name, email, password FROM usuario WHERE email = ?';
  db.query(sql, [email], (err, results) => {
    if (err) {
      console.error('Error querying user:', err);
      req.session.errorMessage = 'Erro ao autenticar. Tente novamente.';
      res.redirect('/loginCad');
    } else {
      if (results.length > 0) {
        const user = results[0];
        const isPasswordValid = bcrypt.compareSync(password, user.password);

        if (isPasswordValid) {
          req.session.userId = user.id;
          req.session.email = email; 
          req.session.name = user.name; 
          req.session.successMessage = 'Login bem-sucedido!';
          res.redirect('/Meu-usuario');
        } else {
          req.session.errorMessage = 'Senha inválida. Tente novamente.';
          res.redirect('/loginCad'); 
        }
      } else {
        req.session.errorMessage = 'Email inválido. Tente novamente.';
        res.redirect('/loginCad'); 
      }
    }
  });
});


app.post('/signup', (req, res) => {
  const { name, email, password } = req.body;

 
  if (!name || !email || !password) {
    req.session.errorMessage = 'Todos os campos são obrigatórios.';
    return res.redirect('/loginCad');
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  const sql = 'INSERT INTO usuario (name, email, password) VALUES (?, ?, ?)';
  db.query(sql, [name, email, hashedPassword], (err, results) => {
    if (err) {
      console.error('Error inserting user:', err);
      req.session.errorMessage = 'Erro ao cadastrar. Tente novamente.';
      res.redirect('/loginCad');
    } else {
      req.session.successMessage = 'Cadastro realizado com sucesso! Faça o login.';
      res.redirect('/loginCad');
    }
  });
});

app.get('/Meu-usuario', (req, res) => {
  if (!req.session.email) {
    req.session.errorMessage = 'Por favor, faça login primeiro para acessar sua página de usuário.';
    return res.redirect('/loginCad');
  }

  const name = req.session.name || 'Usuário';
  const email = req.session.email || 'Não disponível';

  const sql = 'SELECT nome, valorTotal, valorRestante FROM clientes WHERE user_id = ?';
  const userId = req.session.userId;

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('Error querying clients:', err);
      req.session.errorMessage = 'Erro ao buscar clientes. Tente novamente.';
      res.redirect('/');
    } else {
      const labels = results.map(cliente => cliente.nome);
      const valoresTotais = results.map(cliente => cliente.valorTotal);
      const valoresRestantes = results.map(cliente => cliente.valorRestante);
      
      res.render('usuario', {
        isAuthenticated: true,
        name,
        email,
        labels: JSON.stringify(labels),
        valoresTotais: JSON.stringify(valoresTotais),
        valoresRestantes: JSON.stringify(valoresRestantes)
      });
    }
  });
});


app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      res.redirect('/');
    } else {
      res.redirect('/');
    }
  });
});



///////Cadastro de clientes
app.get('/cadastro-cliente', (req, res) => {
  res.render('/');
});


app.post('/cadastrar-cliente', (req, res) => {
  const { nome, quantidadeParcelas, parcela1, parcela2, parcela3, parcela4, parcela5 } = req.body;
  const userId = req.session.userId;


  const valorTotal = parseFloat(parcela1) + parseFloat(parcela2) + parseFloat(parcela3) + parseFloat(parcela4) + parseFloat(parcela5);
  const valorRestante = valorTotal;
  const totalParcelamento = quantidadeParcelas * parseFloat(parcela1);

  const sql = 'INSERT INTO clientes (nome, quantidadeParcelas, parcela1, parcela2, parcela3, parcela4, parcela5, valorTotal, valorRestante, totalParcelamento, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  const values = [nome, quantidadeParcelas, parcela1, parcela2, parcela3, parcela4, parcela5, valorTotal, valorRestante, totalParcelamento, userId];

  db.query(sql, values, (err, results) => {
      if (err) {
          console.error('Error inserting client:', err);
          req.session.errorMessage = 'Erro ao cadastrar cliente. Tente novamente.';
      } else {
          req.session.successMessage = 'Cliente cadastrado com sucesso!';
      }
      res.redirect('/');
  });
});







app.get('/atualizar-cliente/:id', (req, res) => {
  const clienteId = req.params.id;
  
  const sql = 'SELECT * FROM clientes WHERE id = ?';

  db.query(sql, [clienteId], (err, results) => {
      if (err) {
          console.error('Error querying client:', err);
          req.session.errorMessage = 'Erro ao buscar cliente. Tente novamente.';
          res.redirect('/');
      } else {
          const cliente = results[0];
          res.render('atualizar-cliente', { cliente });
      }
  });
});



app.post('/atualizar-cliente/:id', (req, res) => {
  const clienteId = req.params.id;
  const { nome, quantidadeParcelas, parcela1, parcela2, parcela3, parcela4, parcela5, parcela1_paga, parcela2_paga, parcela3_paga, parcela4_paga, parcela5_paga } = req.body;

  const parcela1Paga = parcela1_paga === 'on';
  const parcela2Paga = parcela2_paga === 'on';
  const parcela3Paga = parcela3_paga === 'on';
  const parcela4Paga = parcela4_paga === 'on';
  const parcela5Paga = parcela5_paga === 'on';

  console.log('Valores das parcelas pagas:', [parcela1Paga, parcela2Paga, parcela3Paga, parcela4Paga, parcela5Paga]);

 
  const parcelas = [parcela1, parcela2, parcela3, parcela4, parcela5];
  const valoresParcelas = parcelas.map(parcela => parseFloat(parcela)).filter(value => !isNaN(value));

  const valorTotal = valoresParcelas.reduce((total, value) => total + value, 0);

  const parcelasPagas = [parcela1Paga, parcela2Paga, parcela3Paga, parcela4Paga, parcela5Paga];
  const valoresParcelasPagas = parcelasPagas.map((parcelaPaga, index) => {
      return parcelaPaga ? valoresParcelas[index] : 0;
  });

  const valorParcelasPagas = valoresParcelasPagas.reduce((total, value) => total + value, 0);

  if (!isNaN(valorParcelasPagas)) {
      const valorRestante = valorTotal - valorParcelasPagas;

      const sql = 'UPDATE clientes SET nome = ?, quantidadeParcelas = ?, parcela1 = ?, parcela2 = ?, parcela3 = ?, parcela4 = ?, parcela5 = ?, parcela1_paga = ?, parcela2_paga = ?, parcela3_paga = ?, parcela4_paga = ?, parcela5_paga = ?, valorTotal = ?, valorRestante = ? WHERE id = ?';
      db.query(sql, [nome, quantidadeParcelas, parcela1, parcela2, parcela3, parcela4, parcela5, parcela1Paga, parcela2Paga, parcela3Paga, parcela4Paga, parcela5Paga, valorTotal, valorRestante, clienteId], (err, results) => {
          if (err) {
              console.error('Error updating client:', err);
              req.session.errorMessage = 'Erro ao atualizar cliente. Tente novamente.';
          } else {
              req.session.successMessage = 'Cliente atualizado com sucesso!';
             
              res.redirect('/');
          }
      });
  } else {
      console.error('Erro ao calcular o valor das parcelas pagas:', valorParcelasPagas);
      req.session.errorMessage = 'Erro ao calcular o valor das parcelas pagas. Tente novamente.';

      res.redirect('/');
  }
});

// Rota para excluir um cliente
app.get('/excluir-cliente/:id', (req, res) => {
  const clienteId = req.params.id;
  const sql = 'DELETE FROM clientes WHERE id = ?';
  
  db.query(sql, [clienteId], (err, results) => {
      if (err) {
          console.error('Error deleting client:', err);
          req.session.errorMessage = 'Erro ao excluir cliente. Tente novamente.';
      } else {
          req.session.successMessage = 'Cliente excluído com sucesso!';
      }
      res.redirect('/');
  });
});


// Rota para excluir um cliente usando o método POST (não é necessário)
app.post('/excluir-cliente/:id', (req, res) => {
  const clienteId = req.params.id;
  const sql = 'DELETE FROM clientes WHERE id = ?';
  
 
  db.query(sql, [clienteId], (err, results) => {
      if (err) {
          console.error('Error deleting client:', err);
          req.session.errorMessage = 'Erro ao excluir cliente. Tente novamente.';
      } else {
          req.session.successMessage = 'Cliente excluído com sucesso!';
      }
      res.redirect('/');
  });
});


app.get('/meus-clientes', (req, res) => {
  const userId = req.session.userId;

  const sql = 'SELECT * FROM clientes WHERE user_id = ?';
  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('Error querying clients:', err);
      req.session.errorMessage = 'Erro ao buscar clientes. Tente novamente.';
      res.redirect('/');
    } else {
      const clientes = results;
      res.render('meus-clientes', { clientes });
    }
  });
});


app.get('/clientes', (req, res) => {
  const userId = req.session.userId;

  const sql = 'SELECT * FROM clientes WHERE user_id = ?';
  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('Error querying clients:', err);
      res.status(500).json({ error: 'Erro ao buscar clientes. Tente novamente.' });
    } else {
      res.json(results);
    }
  });
});


app.post('/atualizar-valor-restante', (req, res) => {
  const clienteId = req.body.clienteId;
  const valorRestante = req.body.valorRestante;


});



app.get('/fluxoCaixa', (req, res) => {
  
  const isAuthenticated = req.session.email ? true : false;


  if (!isAuthenticated) {
    req.session.errorMessage = 'Por favor, faça login primeiro para acessar o fluxo de caixa.';
    return res.redirect('/loginCad');
  }

  const sql = 'SELECT * FROM fluxo_caixa';
  db.query(sql, (err, results) => {
    if (err) {
      console.error('Erro ao recuperar dados do fluxo de caixa:', err);
      res.status(500).send('Erro ao recuperar dados do fluxo de caixa.');
    } else {
   
      let valorTotalCadastrado = 0;
      let valorTotalRetirado = 0;
      results.forEach(item => {
      
        const valor = Math.floor(parseFloat(item.valor));
        if (item.tipo === 'entrada') {
          valorTotalCadastrado += valor;
        } else if (item.tipo === 'saida') {
          valorTotalRetirado += valor;
        }
      });

      // Renderizar a página com os dados e enviar para o frontend
      res.render('fluxoCaixa', {
        fluxoCaixa: results,
        valorTotalCadastrado,
        valorTotalRetirado,
        isAuthenticated: true
      });
    }
  });
});







app.post('/fluxoCaixa', (req, res) => {
  const { descricao, resumo, valor, tipo } = req.body;
  console.log('Dados Recebidos:', descricao, resumo, valor, tipo);

  // Verifica se o valor está no formato correto (números e ponto decimal)
  const parsedValor = parseFloat(valor.replace(',', '.')); // Substitui ',' por '.' e converte para float

  if (isNaN(parsedValor)) {
    console.error('Valor inválido:', valor);
    res.status(400).send('Valor inválido: ' + valor);
    return;
  }

  const SQL = 'INSERT INTO fluxo_caixa (descricao, resumo, valor, tipo, data_registro) VALUES (?, ?, ?, ?, NOW())';
  const VALUES = [descricao, resumo, parsedValor, tipo];

  db.query(SQL, VALUES, (err, result) => {
    if (err) {
      console.error('Erro ao inserir dados do fluxo de caixa:', err);
      res.status(500).send('Erro ao salvar os dados do fluxo de caixa no banco de dados');
    } else {
      console.log('Dados do fluxo de caixa inseridos com sucesso!');
      res.redirect('/fluxoCaixa');
    }
  });
});



app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

