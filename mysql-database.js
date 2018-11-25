
var mysql = require('mysql')

// First, checks if it isn't implemented yet.
if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) {
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}

// These params, are used to start the API itself and
// Report itself, correctly.
const PORT = process.env.PORT || 8080;
const IP   = process.env.IP || "localhost"
const DEBUG = process.env.DEBUG || false

// Receive env params (docker+lxd+k8s) support w/ defaults.
const DB_PASS = process.env.DB_PASS || "api_clouddom"
const DB_ENDPOINT = process.env.DB_ENDPOINT || "localhost"
const DB_SCHEME   = process.env.DB_SCHEME || "api_clouddom"
const DB_USER = process.env.DB_USER || "api_clouddom"

var con = mysql.createConnection( {
	host: DB_ENDPOINT,
	user: DB_USER,
	password: DB_PASS,
	database: DB_SCHEME,
} );

con.connect(function(err) {
	if (err) throw err;
	console.log("Connected to database!");
});


module.exports.Register = function (module_callback) {

	return con
}

module.exports.Unregister = function (connection, module_callback) {

	return con
}
