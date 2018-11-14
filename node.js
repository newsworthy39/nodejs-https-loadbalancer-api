var http = require('http');
var HashMap = require('hashmap')
var qs = require('querystring');
var api = require('./api_loadbalancer.js')

const PORT = process.env.PORT || 8080;
const LB   = process.env.LB || "192.168.1.11:5566";
const IP   = process.env.IP || "localhost"
const DEBUG = process.env.DEBUG || false


// This is the routing-map.
var map = new HashMap();
var request_count = 0;

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

function bodyparser (request, response, next, method = ["POST"]) {

    console.log(method + " vs " + request.method);

    if (method.includes(request.method)) {
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
		    value = remove(post[key], ' {}');
		    key = remove(key, ' {}');
		    copy.set(key.toLowerCase(), value);
	    };
	    request.post = copy;
    	    next(request, response);
        });
    } else {
	response.writeHead(501, {'Content-Type': 'application/json', 'X-ServedBy': IP + ":" + PORT });
	response.end("Unsupported operation");
	return;
    }
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
				}
				
				req.contextid = contextid;

				if (DEBUG) {
					console.log("ContextID : {0}".format(req.contextid));
				}

				// call next.
				next(req,res)

			});
		} else {
			res.writeHead(401, {'Content-Type': 'application/json', 'X-ServedBy': IP + ":" + PORT });
			res.end("Missing headers");

		}
	} catch(err) {
		res.writeHead(401, {'Content-Type': 'application/json', 'X-ServedBy': IP + ":" + PORT });
		res.end("Not authorized, missing headers" + err);
	}
}

//A sample GET request
map.set(new RegExp("/loadbalancer/(\\d)+/backends"), function ( req, res) {

	return bodyparser(req, res, function (req, res){

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
		var backend = req.post.get("backend");

		if (DEBUG) {
			console.log(" Received data" + req.post)
		}

		if (!backend) {
			res.writeHead(404, {'Content-Type': 'application/json', 'X-ServedBy': IP + ":" + PORT });
			res.end("No backend defined. ");
			
			return 
		}

		api.CheckPermissionsOnLoadbalancer(contextid, loadbalancerid, req.method, function(result, err) {
			
			if (result == false) {
				res.writeHead(401, {'Content-Type': 'application/json', 
							'X-ServedBy': IP + ":" + PORT });
				res.end(err);

				return;
			}

			if (req.method == "POST") {

				api.AddBackendToLoadbalancer(contextid, loadbalancerid, backend , function(result, err) {

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
			} else if (req.method == "DELETE") {

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
			}

		});

	}catch (err) {
		res.writeHead(404, {'Content-Type': 'application/json', 'X-ServedBy': IP + ":" + PORT });
		res.end("No such loadbalancer. " + err);

	}

}, ["POST","DELETE"] )});


//A sample GET request
map.set(new RegExp("/loadbalancer$"), function(req, res) {

	try {

		// 
		// method: 'round-robin',
		// path: 'http://test.api.dk',
		// lbid: '1',
		//    backend: [ 'http://www.jp.dk', 'http://www.eb.dk']  }
		//

		api.GetLoadBalancersFromContextID(req.contextid, function(result, err) {

			if (err) {
				res.writeHead(404, {'Content-Type': 'application/json', 'X-ServedBy': IP + ":" + PORT });
				res.end("Not loadbalancers found");
			}

			if (DEBUG) {
				console.log(result);
			}

			res.writeHead(200, {'Content-Type': 'application/json', 'X-ServedBy': IP + ":" + PORT });
			res.end(JSON.stringify(result));

			
		});

	}catch (err) {
		res.writeHead(404, {'Content-Type': 'application/json', 'X-ServedBy': IP + ":" + PORT });
		res.end("Not loadbalancers found" + err);

	}

});

// Setup server-part.
const app = require('http').createServer(function (req, res) {
	try {

		// log the request on console
	    	var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
	    	var method = req.method;
	    	var url = req.url;

	    	console.log((++request_count) + ". IP " + ip + " " + method + " " + url);

		var found = false
		map.forEach(function(value, key) {

			if (key.test(url)) {
				found = true
				if (DEBUG) {
					console.log(key + ": " + value);
				}
				var match = key.exec(url);
				req.matches = match;
				return isAuthenticated(req, res, value);
			}
		});

		if (found == false) {
			res.writeHead(404, {'Content-Type': 'application/json', 'X-ServedBy': IP + ":" + PORT });
			res.end(JSON.stringify({ Method: "Not Found"}));
		}

	} catch(err) {
        	console.log(err);
	}
});

app.listen(PORT, () => {
	console.log(`The server is listening on *:${PORT}`);
});
	

