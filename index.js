const unless = require("express-unless");
const express = require("express");
const mongoose = require("mongoose");
const parser = require("body-parser");
const schemas = require("./schema");
const hostSchema = require("./hostSchema");

require("dotenv").config();

const app = express();

const port = process.env.PORT || 3000;
const connections = {};
const dbcache = {};
let hostDB = null;
let hostConnection = null;

const getHostDB = (req, res, next) => {
  if (hostDB && hostConnection) {
    req.hostDB = hostDB;
    req.hostConnection = hostConnection;
    next();
  }

  const uri = process.env.MONGO_URI.replace("__db__", "xhost");
  console.log(`Connecting to host db`, uri);
  const conn = mongoose.createConnection(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const models = {};
  Object.keys(hostSchema).map((model) => {
    if (hostSchema.hasOwnProperty(model)) {
      models[model] = conn.model(model, hostSchema[model]);
    }
  });

  conn.on("connected", () => {
    console.log(`Connected to host`);

    req.hostDB = hostDB = models;
    req.hostConnection = hostConnection = conn;
    next();
  });
};

const connectDB = async (req, res, next) => {
  const host = req.headers.host;
  const hostDetails = await req.hostDB.Host.findOne({ host });
  if (!hostDetails) {
    return res.send("Host not found");
  }

  const db = hostDetails.db;
  req.tenant = { host, db };

  console.log(`Should connect to ${db}`);

  if (!connections[db]) {
    console.log(
      `Connecting to ${db}`,
      process.env.MONGO_URI.replace("__db__", db)
    );
    const uri = process.env.MONGO_URI.replace("__db__", db);
    const conn = mongoose.createConnection(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const models = {};
    Object.keys(schemas).map((model) => {
      if (schemas.hasOwnProperty(model)) {
        models[model] = conn.model(model, schemas[model]);
      }
    });

    conn.on("connected", () => {
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
};
connectDB.unless = unless;

app.use(parser.urlencoded({ extended: true, limit: "100mb" }));
app.use(parser.json({ limit: "100mb" }));

app.use(getHostDB);
app.use(connectDB.unless({ path: ["/add-host"] }));

app.get("", (req, res) => {
  res.send(`Hello World host:${req.tenant.host} db:${req.tenant.db}`);
});

app.post("/create", (req, res) => {
  const todo = new req.db.Todo({ todo: req.body.todo });
  todo
    .save()
    .then((obj) => res.send(obj))
    .catch((e) => {
      console.log(e);
      res.send("Error in creating todo");
    });
});

app.get("/list", (req, res) => {
  const query = req.db.Todo.find({});
  query
    .then((obj) => res.send(obj))
    .catch((e) => {
      console.log(e);
      res.send("Error in finding todos");
    });
});

app.post("/add-host", async (req, res) => {
  const { host, db } = req.body;
  console.log(req.hostDB);
  const newHost = new req.hostDB.Host({ host, db });

  await newHost.save();
  console.log({ newHost });
  res.send("Done");
});

const server = app.listen(port, () => {
  const host = server.address().address;
  const port = server.address().port;
  console.log(`App listening at http://${host}:${port}`);
});
