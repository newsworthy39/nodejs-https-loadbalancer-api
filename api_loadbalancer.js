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


module.exports.CreateLoadbalancerWithDefaultPermissions = function(cid, method, path, type, cb) {
	var sql = "INSERT INTO loadbalancer (method, path, type) VALUES ('{0}','{1}','{2}')".format(method, path, type);

	con.query(sql, function(err, result, fields) {
		if (err) throw err;
		var id = result.insertId;

		var sql = "INSERT INTO context_loadbalancer (contextid, loadbalancerid) VALUES ({0},{1})".format(cid, id);
		con.query(sql, function(err, result, fields) {
			if (err) throw err;
			var clid = result.insertId;
			
			var sql = "INSERT INTO context_loadbalancer_permissions (context_loadbalancerid, permissionkey, permissiondata) VALUES ({0},'GET','ALLOW'),({0},'POST','ALLOW'),({0},'DELETE','ALLOW'),({0},'PUT','ALLOW')".format(clid);
			con.query(sql, function(err, result, fields) {
				if (err) throw err;
				cb({ "loadbalancerid": id});
			});

		});
	});
}


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
module.exports.AddBackendToLoadbalancer = function AddBackendToLoadbalancer(loadbalancerid, backend, cb) {
	var sql = "INSERT INTO loadbalancer_routes (lbid, backend) VALUES ({0},'{1}')".format(loadbalancerid, backend);
	con.query(sql, function (err, result) {
		if (err || result.length == 0) {
			cb([], "Could not add to Loadbalancer backend");
		} else {
			cb({ "backendid" : result.insertId }, false);
		};
	});
}

module.exports.RemoveBackendFromLoadbalancer = function RemoveBackendFromLoadbalancer(loadbalancerid, backend, cb) {
	var sql = "DELETE FROM loadbalancer_routes WHERE id = {0} and lbid = '{1}'".format(backend, loadbalancerid);
	con.query(sql, function (err, result) {
		if (err || result.length == 0) {
			cb([], "Could not remove from Loadbalancer backend");
		} else {
			cb(result)
		};
	});

}

module.exports.DeleteLoadbalancerAndPermissionsAndRoutes = function(contextid, loadbalancerid) {
	var sql = "DELETE FROM loadbalancer WHERE id = {0}".format(loadbalancerid);
	con.query(sql, function (err, result) {
		if (err) {
			throw err
		} 
		console.log("Number of records deleted: " + result.affectedRows);
	});

	sql = "DELETE FROM context_loadbalancer_permissions WHERE context_loadbalancerid = (SELECT id FROM context_loadbalancer WHERE contextid = {0} AND loadbalancerid = {1})".format(contextid, loadbalancerid);
	con.query(sql, function (err, result) {
		if (err) {
			throw err
		} 
		console.log("Number of records deleted: " + result.affectedRows);
	});

	sql = "DELETE FROM context_loadbalancer WHERE contextid = {0} AND loadbalancerid = {1}".format(contextid, loadbalancerid);
	con.query(sql, function (err, result) {
		if (err) {
			throw err
		} 
		console.log("Number of records deleted: " + result.affectedRows);
	});

	sql = "DELETE FROM loadbalancer_routes WHERE lbid = {0}".format(loadbalancerid);
	con.query(sql, function (err, result) {
		if (err) {
			throw err
		} 
		console.log("Number of records deleted: " + result.affectedRows);
	});

}

module.exports.GetLoadbalancerPermissions = function GetLoadbalancerPermissions(contextid, methods, loadbalancerid, cb) {

	var sql = 'select cl.loadbalancerid, clp.permissionkey, clp.permissiondata from context c inner join context_loadbalancer cl on cl.contextid = c.id  inner join context_loadbalancer_permissions clp on cl.id = clp.context_loadbalancerid where c.id = {0} AND cl.loadbalancerid = {1} AND clp.permissionkey IN ({2}) AND clp.permissiondata != "DENY"'.format(contextid, loadbalancerid, "\"" + methods.join('","') + "\"")

	if (DEBUG) {
		console.log(sql);
	}
	con.query(sql, function(err, result) {
		if (err) {
			return cb(false, err);
		}
		if (result.length == 0) {
			return cb([], "No permissions found.")
		}

		cb(result, null)
	});
}

module.exports.GetLoadbalancerIdsAndPermissions = function GetLoadbalancerIdsAndPermissions(contextid, methods,cb) {

	var sql = 'select cl.loadbalancerid, clp.permissionkey, clp.permissiondata from context c inner join context_loadbalancer cl on cl.contextid = c.id  inner join context_loadbalancer_permissions clp on cl.id = clp.context_loadbalancerid where c.id = {0} AND clp.permissionkey IN ({1}) AND clp.permissiondata != "DENY"'.format(contextid,"\"" + methods.join('","') + "\"")

	if (DEBUG) {
		console.log(sql);
	}
	con.query(sql, function(err, result) {
		if (err) {
		 	return cb(false, err);
		}
		if (result.length == 0) {
			return cb([], "No permissions found.");
		}

		return cb(result, null)
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

		var sql = "select id, backend from loadbalancer_routes where lbid = {0}".format(results.id);
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
