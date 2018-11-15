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


const PORT = process.env.PORT || 8080;
const LB   = process.env.LB || "192.168.1.11:5566";
const IP   = process.env.IP || "localhost"
const DEBUG = process.env.DEBUG || false

var con = mysql.createConnection( {
	host: 'localhost',
	user: 'api_clouddom',
	password: 'api_clouddom',
	database: 'api_clouddom',
} );

con.connect(function(err) {
	if (err) throw err;
	console.log("Connected to database!");
});


//
//> select * from loadbalancer_routes;
//+----+------+-----------------------+
//| id | lbid | backend               |
//+----+------+-----------------------+
//|  1 | 1    | http://www.jp.dk      |
//|  2 | 1    | https://www.tuxand.me |
//|  3 | 2    | http://192.168.1.1    |
//+----+------+-----------------------+
//
module.exports.AddBackendToLoadbalancer = function AddBackendToLoadbalancer(contextid, loadbalancerid, backend, cb) {

	
	var sql = "INSERT INTO loadbalancer_routes (lbid, backend) VALUES ({0},'{1}')".format(loadbalancerid, backend);
	con.query(sql, function (err, result) {
		if (err || result.length == 0) {
			cb([], "Could not add to Loadbalancer backend");
		} else {
			cb(result)
		};
	});
}

module.exports.RemoveBackendFromLoadbalancer = function RemoveBackendFromLoadbalancer(contextid, loadbalancerid, backend, cb) {
	var sql = "DELETE FROM loadbalancer_routes WHERE id = {0} and lbid = '{1}'".format(backend, loadbalancerid);
	con.query(sql, function (err, result) {
		if (err || result.length == 0) {
			cb([], "Could not remove from Loadbalancer backend");
		} else {
			cb(result)
		};
	});

}

module.exports.GetLoadbalancerPermissions = function GetLoadbalancerPermissions(contextid, methods, loadbalancerid, cb) {

	var sql = 'select cl.id as loadbalancerid, clp.permissionkey, clp.permissiondata from context c inner join context_loadbalancer cl on cl.contextid = c.id  inner join context_loadbalancer_permissions clp on cl.id = clp.context_loadbalancerid where c.id = {0} AND cl.id = {1} AND clp.permissionkey IN ({2}) AND clp.permissiondata != "DENY"'.format(contextid, loadbalancerid, "\"" + methods.join('","') + "\"")

	if (DEBUG) {
		console.log(sql);
	}
	con.query(sql, function(err, result) {
		if (err) {
			cb(false, err);
			return
		}
		if (result.length == 0) {
			cb(false, "No such permission")
			return
		}

		cb(result, null)
	});
}

module.exports.GetLoadbalancerIdsAndPermissions = function GetLoadbalancerIdsAndPermissions(contextid, methods,cb) {

	var sql = 'select cl.id as loadbalancerid, clp.permissionkey, clp.permissiondata from context c inner join context_loadbalancer cl on cl.contextid = c.id  inner join context_loadbalancer_permissions clp on cl.id = clp.context_loadbalancerid where c.id = {0} AND clp.permissionkey IN ({1}) AND clp.permissiondata != "DENY"'.format(contextid,"\"" + methods.join('","') + "\"")

	if (DEBUG) {
		console.log(sql);
	}
	con.query(sql, function(err, result) {
		if (err) {
			cb(false, err);
			return
		}
		if (result.length == 0) {
			cb(false, "No such permission")
			return
		}

		cb(result, null)
	});
}


module.exports.GetContextId = function GetContextId(accesskey, secret, cb) {
	var sql = "select c.id as contextid, auth.accesskey, auth.secret from context c inner join authentication auth on auth.id = c.id WHERE auth.accesskey = '{0}' AND auth.secret = '{1}'".format(accesskey, secret);
	con.query(sql, function (err, result) {
		if (err || result.length == 0) {
			cb([], "No results");
		} else {

			cb(result[0].contextid)
		};
	});
}

module.exports.GetLoadBalancersFromPermissionsResult = function GetLoadBalancersFromPermissionsResult(result, cb) {
	
//	ids = result.filter(word => [0].loadbalancerid
	var ids = result.map(a => a.loadbalancerid);
	if (DEBUG) {
		console.log(result);
	}

	var sql = "select * from loadbalancer where id IN ( {0} )".format(ids);
	con.query(sql, function (err, result) {
                if (err || result.length == 0) {
                        cb([], "No results");
                } else {

			rr = []
                        PopulateRoutesInLoadbalancer(result, function(results, expect) {

				rr.push(results)

				if (expect == results.expect) {
					if (DEBUG) {
						console.log("Result {0}, expected: {1} achieved!".format(results.expect, expect));
					}
					cb(rr);
				}
			}, 1, result.length)
                };
        });
	return 0;

}

// We will use the methods learned from prolog, to create a promise-like
// situation, that when reached, can be used, to fire the 
// last callback, creating an async-wait condition. We exploit the 
// stack, to achieve this.
function PopulateRoutesInLoadbalancer(results, done, count, length) {
	
	if (Array.isArray(results)) {
		results.forEach(function(row) {
			PopulateRoutesInLoadbalancer(row, done, count++, length);
		});
	} else {

		if (DEBUG) {
			console.log("Looking up backends for lb {0}, count {1}".format(results.id, count));
		}

		var sql = "select backend from loadbalancer_routes where lbid = {0}".format(results.id);
		con.query(sql, function (err, result) {
			results.expect = count;

			if (err || result.length == 0) {
				if (DEBUG) {
					console.log("No backend for lbid = {0}".format(results.id))
				}
			} else {
				results.backends = result;
			};
			done(results, length)

		});
	}

}
