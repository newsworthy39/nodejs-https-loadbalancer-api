const PORT = process.env.PORT || 8080;
const IP   = process.env.IP || "localhost"
const DEBUG = process.env.DEBUG || false
const LB    = process.env.LB || 12

var request = require('request');
var qs = require('querystring');
var dispatcher = require('./httpdispatcher.js')
var HashMap = require('hashmap')

// Clouddom-stuff
var api = require('./api_loadbalancer.js')
var events = require('./api_events.js')

const MODULE_NAME = "EVENTS"
const connection = require('./mysql-database.js')
const con = connection.Register(MODULE_NAME)

api.Use(con)
events.Use(con)

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

function remove(str, chars) {
  return str.replace(new RegExp(`[${chars}]`, 'g'), '');
}

function ncsalogger(request, response, next) {
    const { headers } = request;

    next(request, response);
    
    console.log("node-events %s \"%s %s HTTP/%s\" %s", headers["x-forwarded-for"], request.method, request.url, request.httpVersion, response.statusCode, headers["user-agent"]);
}

function bodyparser (request, response, next) {
    if (["POST","PUT","DELETE"].includes(request.method)) {
        var body = '';

        request.on('data', function (data) {
            body += data;

            // Too much POST data, kill the connection!
            // 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
            if (body.length > 1e6)
                request.connection.destroy();
        });

        request.on('end', function () {
	    // TODO: Use an actual json-parser, instead of hacking-this-shit-together.
            var post = qs.parse(body, ",", ":");
            // use post['blah'], etc.
	    var copy = new HashMap()
	    for (var key in post) {
		    value = remove(post[key], ' {}\"\'');
		    key = remove(key, ' {}\"\'');
		    copy.set(key.toLowerCase(), value);
	    };
	    request.post = copy;
        });
    }
    next(request, response);
}

// IsAuthenticated. This middleware, uses the API
// to load the ContextID, that is used to identify 
// components. The contextID comes from the authentication
// backend, configured.
function isAuthenticated(req, res, next) {

	try {
		const { headers } = req;
		if (DEBUG) {
			console.log(headers);
		}
		if (headers["accesskey"] != undefined &&  headers["secret"] != undefined ) {
			api.GetContextId(headers["accesskey"], headers["secret"], function(contextid, err) {

				if (err) {
					res.writeHead(401, {'Content-Type': 'application/json', 'X-ServedBy': IP + ":" + PORT });
					res.end("No Such Context");

					return;
				}
				
				req.contextid = contextid;

				if (DEBUG) {
					console.log("ContextID : {0}".format(req.contextid));
				}

    				next(req, res);
			});
		} else {
			res.writeHead(401, {'Content-Type': 'application/json', 'X-ServedBy': IP + ":" + PORT });
			res.end("Missing headers\n");
			return;
		}
	} catch(err) {
		res.writeHead(401, {'Content-Type': 'application/json', 'X-ServedBy': IP + ":" + PORT });
		res.end("Not authorized, missing headers\n" + err);
	}
}


dispatcher.OnPost( new RegExp("/events$"), function ( req, res) {
	try {
	        const { headers } = req;
                var contextid = req.contextid;
                var eventid = req.post.get("eventid");
		var eventdata = req.post.get("eventdata");

	        if (!eventid || !eventdata) {
			res.writeHead(400, {'Content-Type': 'text/plain','X-ServedBy': IP + ":" + PORT });
			res.end("Wrong json format. (format: json{ eventid: , eventdata:}.\n");
			return
		}
		
		res.writeHead(201, {'Content-Type': 'text/plain', 'X-ServedBy': IP + ":" + PORT });
		res.end("OK");

	} catch (err) {
		res.writeHead(400, {'Content-Type': 'application/json', 'X-ServedBy': IP + ":" + PORT });
		res.end(JSON.stringify ( {"Malformed" : err} ));
	}

});

dispatcher.OnError(function(req, res) {
	res.writeHead(404, {'Content-Type': 'text/plain', 'X-ServedBy': IP + ":" + PORT });
	res.end("(node-events.js) Not Found.\n");
});


// Setup server-part.
const app = require('http').createServer(function (req, res) {
	try {
		// NCSA(ish)-logging.
		ncsalogger(req, res, function () {
			return bodyparser(req, res, function() {
				return isAuthenticated(req, res, function() {
					dispatcher.route(req, res);
				});
			});
		});

	} catch(err) {
        	console.error(err.stack || err);
	}
});


var myjsonobject = { "backend":`http://${IP}:${PORT}`}

// Register shutdown-function.
var register = function(callback) {
        var payload = JSON.stringify({ "backend":`http://${IP}:${PORT}`})
	var backend = 'https://api.clouddom.eu/loadbalancer/12/backends'
	var options = {
	    url    : backend,
	    headers: {
	      'Content-Type': 'application/json',
	      'accesskey' : 'test',
	      'secret':'test',
	    },
	    method: 'POST',
	    body: payload,
	}
	request(options, function(error, response, body)  {
		if (error) throw error;
                callback(JSON.parse(body), error);
	});
}


app.listen(PORT, () => {
        register( function(result, err) {
                if (err) throw err;
                var id = result.backendid;

                // Register shutdown-function.
                var shutdown = function() {

			// Unregister events.
			connection.Unregister(con, MODULE_NAME, function(result, err) {
				if (err) throw err;

				var backend = `https://api.clouddom.eu/loadbalancer/12/backends/${id}`
				var options = {
				    url    : backend,
				    headers: {
				      'Content-Type': 'text/plain',
				      'accesskey' : 'test',
				      'secret':'test',
				    },
				    method: 'DELETE',
				}
				request(options, function(error, response, body)  {
					process.exit();
				});
			});
                }
                process.on( "SIGINT", shutdown);

                console.log(`The server is listening on *:${PORT} with id: ${id}.`);
        });
});
