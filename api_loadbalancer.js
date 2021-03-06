
// These params, are used to start the API itself and
// Report itself, correctly.
const PORT = process.env.PORT || 8080;
const IP   = process.env.IP || "localhost"
const DEBUG = process.env.DEBUG || false

module.exports.Use = function(backend) {
	con = backend;
}

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
	// Start by removing matches, and re-inserting it.
	this.RemoveBackendsFromLoadbalancer(loadbalancerid, backend, function(result, err) {
		var sql = "INSERT INTO loadbalancer_routes (lbid, backend) VALUES ({0},'{1}')".format(loadbalancerid, backend);
		con.query(sql, function (err, result) {
			if (err || result.length == 0) {
				cb([], "Could not add to Loadbalancer backend");
			} else {
				cb({ "backendid" : result.insertId }, false);
			};
		});
	});
}

module.exports.RemoveBackendsFromLoadbalancer = function (lbid, backend, cb) {
	var sql = "DELETE FROM loadbalancer_routes WHERE lbid = {0} and backend= '{1}'".format(lbid, backend);
	con.query(sql, function (err, result) {
		if (err || result.length == 0) {
			cb([], "Could not remove from Loadbalancer backend");
		} else {
			cb(result,null)
		};
	});

}

module.exports.RemoveBackendFromLoadbalancer = function (loadbalancerid, backend, cb) {
	var sql = "DELETE FROM loadbalancer_routes WHERE id = {0} and lbid = '{1}'".format(backend, loadbalancerid);
	con.query(sql, function (err, result) {
		if (err || result.length == 0) {
			cb([], "Could not remove from Loadbalancer backend");
		} else {
			cb(result,null)
		};
	});

}

module.exports.DeleteLoadbalancerAndPermissionsAndRoutes = function(contextid, loadbalancerid) {
	var sql = "DELETE FROM loadbalancer WHERE id = {0} AND terminationprotection = 0".format(loadbalancerid);
	con.query(sql, function (err, result) {
		if (err) throw err
		console.log("Number of records deleted: " + result.affectedRows);

		sql = "DELETE FROM context_loadbalancer_permissions WHERE context_loadbalancerid = (SELECT id FROM context_loadbalancer WHERE contextid = {0} AND loadbalancerid = {1})".format(contextid, loadbalancerid);
		con.query(sql, function (err, result) {
			if (err) throw err
			console.log("Deleted context_loadbalancer_permissions deleted: " + result.affectedRows);

			sql = "DELETE FROM context_loadbalancer WHERE contextid = {0} AND loadbalancerid = {1}".format(contextid, loadbalancerid);
			con.query(sql, function (err, result) {
				if (err) throw err

				console.log("Deleted context_loadbalancer records:: " + result.affectedRows);

				sql = "DELETE FROM loadbalancer_routes WHERE lbid = {0}".format(loadbalancerid);
				con.query(sql, function (err, result) {
					if (err) throw err
					console.log("Deleted loadbalancer_routes: " + result.affectedRows);
				});

			});

		});

	});
}

module.exports.SetTerminationProtectionOnLoadbalancer = function(loadbalancerid, value, callback) {
	var sql = "UPDATE loadbalancer SET terminationprotection = {0}".format(value);
	con.query(sql, function(err, result, fields) {
		if (err) throw err;
		callback(result, err);
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

	// 
	// id: 1,
	// method: "round-robin",
	// path: "https://api.clouddom.eu/loadbalancer",
	// type: "apitarget",
	// terminationprotection: 1,
	// healthcheck_status: 0,
	// healthcheck_path: "",
	// healthcheck_active: 0,

	var sql = "select id, method, path, type, terminationprotection, healthcheck_status as HealthcheckStatus, healthcheck_path as HealthcheckPath, healthcheck_active as HealthcheckActive, healthcheck_interval as HealthcheckInterval from loadbalancer where id IN ( {0} )".format(ids);
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

module.exports.GetCapabilities = function(callback ) {

	var sql = "SELECT module_name as ModuleName FROM capabilities";

	con.query(sql, function(err, result, fields) {
		if (err) throw err;
		callback(result, err);
	});



}
