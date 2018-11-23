
// These params, are used to start the API itself and
// Report itself, correctly.
const PORT = process.env.PORT || 8080;
const IP   = process.env.IP || "localhost"
const DEBUG = process.env.DEBUG || false

const MODULE_NAME = "EVENTS"
const con = require('./mysql-database.js').Register(MODULE_NAME)

