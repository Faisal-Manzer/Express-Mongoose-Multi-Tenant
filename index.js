const unless = require('express-unless');
const express = require('express');
const mongoose = require('mongoose');
const redis = require('redis');
const parser = require('body-parser');
const schemas = require('./schema');
const { promisify } = require('util');
require('dotenv').config();


const app = express();
const client = redis.createClient();

const port = 3000;
const redisGet = promisify(client.get).bind(client);
const connections = {};
const dbcache = {};

const connectDB = async (req, res, next) => {
  const host = req.headers.host;
  const db = await redisGet(`host:${host}`);
  if (!db) res.send('Host not found');
  req.tenant = { host, db };

  console.log(`Should connect to ${db}`);

  if (!connections[db]) {
    console.log(`Connecting to ${db}`);
    const uri = process.env.MONGO_URI.replace('__db__', db);
    const conn = mongoose.createConnection(uri);

    const models = {};
    Object.keys(schemas).map((model) => {
      if (schemas.hasOwnProperty(model)) {
        models[model] = conn.model(model, schemas[model]);
      }
    });

    conn.on('connected', () => {
      console.log(`Connected to ${db}`);
      connections[db] = conn;
      req.db = dbcache[db] = models;
      next();
    });
  } else {
    console.log(`using cached db ${db}`);
    req.db = dbcache[db];
    next();
  }
}
connectDB.unless = unless;

app.use(parser.urlencoded({ extended: true, limit: '100mb' }));
app.use(parser.json({ limit: '100mb' }));

app.use(connectDB.unless({ path: ['/add-host'] }));

app.get('', (req, res) => {
  res.send(`Hello World host:${req.tenant.host} db:${req.tenant.db}`);
});

app.post('/create', (req, res) => {
  const todo = new req.db.Todo({ todo: req.body.todo });
  todo.save()
    .then((obj) => res.send(obj))
    .catch((e) => {
      console.log(e);
      res.send('Error in creating todo');
    });
});

app.get('/list', (req, res) => {
  const query = req.db.Todo.find({});
  query
    .then((obj) => res.send(obj))
    .catch((e) => {
      console.log(e);
      res.send('Error in finding todos');
    });
});


app.post('/add-host', async (req, res) => {
  const { host, db } = req.body;
  const result = await client.set(`host:${host}`, db);
  console.log({ result });
  res.send('Done');
});

const server = app.listen(port, () => {
  const host = server.address().address;
  const port = server.address().port;
  console.log(`App listening at http://${host}:${port}`);
});
