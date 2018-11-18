const PORT = process.env.PORT || 8080;
const IP   = process.env.IP || "localhost"
const DEBUG = process.env.DEBUG || false
const LB    = process.env.LB || 1

var http = require('http');
var qs = require('querystring');
var api = require('./api_loadbalancer.js')
var dispatcher = require('./httpdispatcher.js')
var HashMap = require('hashmap')

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
    
    console.log("%s \"%s %s HTTP/%s\" %s", headers["x-forwarded-for"], request.method, request.url, request.httpVersion, response.statusCode, headers["user-agent"]);
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


dispatcher.OnPost(new RegExp("/loadbalancer/(\\d+)/backends$"), function (req, res) {
	try {

		const { headers } = req;
		var contextid = req.contextid;
		var loadbalancerid = req.matches[1];
		var backend = req.post.get("backend");

	        if (!backend) {
			res.writeHead(400, {'Content-Type': 'text/plain','X-ServedBy': IP + ":" + PORT });
			res.end("No backend posted (format: json{ backend: http://www.dr.dk }.\n");

			return
		}

    		// function GetLoadbalancerPermissions(contextid, methods, loadbalancerid, cb) 
                api.GetLoadbalancerPermissions(contextid, [ req.method ], loadbalancerid, function(result, err) {

                        if (!result && !err) {
                                res.writeHead(401, {'Content-Type': 'text/plain',
                                                        'X-ServedBy': IP + ":" + PORT });
                                res.end("No such loadbalancer.\n");

                                return;
                        }

                        if (err && !result) {
                                res.writeHead(401, {'Content-Type': 'text/plain',
                                                        'X-ServedBy': IP + ":" + PORT });
                                res.end("Permission denied.\n");

                                return;

                        }

			api.AddBackendToLoadbalancer(loadbalancerid, backend , function(result, err) {

				if (err) {
					res.writeHead(500, {'Content-Type': 'application/json',
						'X-ServedBy': IP + ":" + PORT });
					res.end(err);
				}

				res.writeHead(200, {'Content-Type': 'application/json', 
						'X-ServedBy': IP + ":" + PORT });

				res.end(JSON.stringify(result));

			});
		});
	}catch (err) {
		res.writeHead(404, {'Content-Type': 'text/plain', 'X-ServedBy': IP + ":" + PORT });
		res.end("No such loadbalancer. " + err);
	}

});

/*
 * Loadbalancer backends api-endpoints.
 */
dispatcher.OnDelete(new RegExp("/loadbalancer/(\\d+)/backends/(\\d+)$"), function ( req, res) {
	try {
		const { headers } = req;
		// 
		// method: 'round-robin',
		// path: 'http://test.api.dk',
		// lbid: '1',
		//    backend: [ 'http://www.jp.dk', 'http://www.eb.dk']  }
		//
		var contextid = req.contextid;
		var loadbalancerid = req.matches[1];

		// function GetLoadbalancerPermissions(contextid, methods, loadbalancerid, cb) 
		api.GetLoadbalancerPermissions(contextid, [ req.method ], loadbalancerid, function(result, err) {
			
			if (!result && !err) {
				res.writeHead(401, {'Content-Type': 'application/json', 
							'X-ServedBy': IP + ":" + PORT });
				res.end("No such loadbalancer.\n");

				return;
			}

			if (err && !result) {
				res.writeHead(401, {'Content-Type': 'application/json', 
							'X-ServedBy': IP + ":" + PORT });
				res.end("Permission denied.\n");

				return;

			}

			var backend = req.matches[2];
			if (!backend) {
				res.writeHead(404, {'Content-Type': 'application/json', 
					'X-ServedBy': IP + ":" + PORT });
				res.end("No backend supplied (format: loadbalancer/{0}/backends/(\\d)+.\n".format(loadbalancerid));
		
				return 
			}


			api.RemoveBackendFromLoadbalancer(contextid, loadbalancerid, backend , function(result, err) {

				if (err) {
					res.writeHead(404, {'Content-Type': 'application/json', 
							'X-ServedBy': IP + ":" + PORT });

					res.end(err);
				}

				if (DEBUG) {
					console.log(result);
				}

				res.writeHead(200, {'Content-Type': 'application/json', 'X-ServedBy': IP + ":" + PORT });
				res.end(JSON.stringify(result));
			

			});

		});

	}catch (err) {
		res.writeHead(404, {'Content-Type': 'text/plain', 'X-ServedBy': IP + ":" + PORT });
		res.end("No such loadbalancer. " + err);
	}
});

dispatcher.OnPost( new RegExp("/loadbalancer$"), function ( req, res) {
	try {
	       const { headers } = req;
                var contextid = req.contextid;
                var method = req.post.get("method");
                var path = req.post.get("path");
		var type = req.post.get("type");

	        if (!method || !path || !type) {
			res.writeHead(400, {'Content-Type': 'text/plain','X-ServedBy': IP + ":" + PORT });
			res.end("Wrong json format. (format: json{ method: , path:, type: 'ProxyTarget'}.\n");

			return
		}


		api.CreateLoadbalancerWithDefaultPermissions(contextid, method, path, type, function(result) {
			res.writeHead(200, {'Content-Type': 'application/json', 'X-ServedBy': IP + ":" + PORT });
			res.end(JSON.stringify(result));
		});
	} catch (err) {
		res.writeHead(400, {'Content-Type': 'text/plain', 'X-ServedBy': IP + ":" + PORT });
		res.end("Malformed request: " + err);
	}

});

dispatcher.OnDelete( new RegExp("/loadbalancer/(\\d+).?$"), function( req, res) {
	try {
		var loadbalancerid = req.matches[1];

		// Fetch by permission.
		api.GetLoadbalancerIdsAndPermissions(req.contextid, [req.method], function(result, err) {
			if (!result) {
				res.writeHead(404, {'Content-Type': 'text/plain', 'X-ServedBy': IP + ":" + PORT });
				res.end("No loadbalancers found. " + err + "\n");
				return 
			}

			if (DEBUG) {
				console.log(result);
			}

			result.forEach(function(row) {
				if (row.loadbalancerid == loadbalancerid) {
					api.DeleteLoadbalancerAndPermissionsAndRoutes
						(req.contextid, row.loadbalancerid);
				}
			});
		
			res.writeHead(200, {'Content-Type':'application/json', 'X-ServedBy': IP + ":" + PORT });
			res.end(JSON.stringify(result));
		});
	} catch(err) {
		res.writeHead(400, {'Content-Type':'text/plain', 'X-ServedBy': IP + ":" + PORT });
		res.end("Malformed request, err: " + err);
	}
});

// OnGet. Extract full json loadbalancer-configuration.
// Super-tidy, to be used with GoLang http/https-server.
dispatcher.OnGet( new RegExp("/loadbalancer$") , function(req, res) {
	try {
		// method: 'round-robin',
		// path: 'http://test.api.dk',
		// lbid: '1',
		//    backend: [ 'http://www.jp.dk', 'http://www.eb.dk']  }
		//
		api.GetLoadbalancerIdsAndPermissions(req.contextid, [req.method], function(result, err) {
			if (err || result.length == 0) {
				res.writeHead(200, {'Content-Type': 'text/plain', 'X-ServedBy': IP + ":" + PORT });
				res.end(JSON.stringify({}));
				return 
			}

			if (DEBUG) {
				console.log(result);
			}

			// Load loadbalancer from result-set.
			api.GetLoadBalancersFromPermissionsResult(result, function(result, err) {
				res.writeHead(200, {'Content-Type': 'application/json', 'X-ServedBy': IP + ":" + PORT });
				res.end(JSON.stringify(result));
			});
		});
	}catch (err) {
		res.writeHead(500, {'Content-Type': 'text/plain', 'X-ServedBy': IP + ":" + PORT });
		res.end("Server error: " + err + ".\n");
	}
});

dispatcher.OnError(function(req, res) {
	res.writeHead(404, {'Content-Type': 'text/plain', 'X-ServedBy': IP + ":" + PORT });
	res.end("Not Found.\n");
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

app.listen(PORT, () => {
	// When the API boots up, it adds itself, to the api-loadbalancer ;)
	// Context-id = 1, Loadbalancer.
	api.AddBackendToLoadbalancer(LB, "http://{0}:{1}".format(IP ,PORT), function(result, err) {
		console.log(`The server is listening on *:${PORT} with backendid ${result.backendid}.`);

		// Register shutdown-function.
		var shutdown = function() {

		  api.RemoveBackendFromLoadbalancer(LB, result.backendid)
		  // register-information.
		  if (DEBUG)
			console.log(`de-registering the listening on *:${PORT} with backendid ${result.backendid}.`);

		  // Leave
		  process.exit();
		}
		process.on( "SIGINT", shutdown );
	});
});
