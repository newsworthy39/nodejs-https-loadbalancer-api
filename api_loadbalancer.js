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
	var sql = "DELETE FROM loadbalancer_routes WHERE lbid = {0} and backend = '{1}'".format(loadbalancerid, backend);
	con.query(sql, function (err, result) {
		if (err || result.length == 0) {
			cb([], "Could not remove from Loadbalancer backend");
		} else {
			cb(result)
		};
	});

}

module.exports.CheckPermissionsOnLoadbalancer = function CheckPermissionsOnLoadbalancer(contextid, loadbalancerid, operation, cb) {
	var sql = "select permissionkey, permissiondata from context_loadbalancer_permissions where context_loadbalancerid = (select id from context_loadbalancer where contextid = {0} and loadbalancerid={1}) AND permissionkey = '{2}'".format(contextid, loadbalancerid,operation);

	if (DEBUG) {
		console.log(sql);
	}
	con.query(sql, function(err, result) {
		if (err || result.length == 0) {
			cb(false, "Permission denied")
		} else {
			if (result[0].permissiondata == "ALLOW") {
				cb(true, "Permission granted")
			}

			if (result[0].permissiondata == "DENY") {
				cb(false, "Permission denied")
			}

		}
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

module.exports.GetLoadBalancersFromContextID = function GetLoadBalancersFromContextID(contextid, cb) {
	var sql = "select lb.id, lb.type, lb.method, lb.path from context c inner join context_loadbalancer cl on cl.contextid = c.id inner join loadbalancer lb on cl.loadbalancerid = lb.id where c.id = '{0}'".format(contextid);
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
