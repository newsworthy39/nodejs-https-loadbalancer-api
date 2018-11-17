const DEBUG = process.env.DEBUG || false

// This is the routing-map.
var map = [];
var error = [];

module.exports.OnGet = function OnGet(regex, callback) {
	map.push({ methods: ['GET'], key: regex, callback: callback });
}

module.exports.OnPost = function OnPost(regex, callback) {
	map.push({ methods: ['POST'], key: regex, callback: callback });
}

module.exports.OnDelete = function OnDelete(regex, callback) {
	map.push({ methods: ['DELETE'], key: regex, callback: callback });
}

module.exports.OnPut = function OnPut(regex, callback) {
	map.push({ methods: ['PUT'], key: regex, callback: callback });
}

module.exports.On = function On(methods, regex, callback) {
	map.push({ methods: methods , key: regex, callback: callback });
}

module.exports.OnError = function OnError(callback) {
	error.push(callback);
}

module.exports.route = function route(req, res) {
	var found = false;

	map.forEach(function(object) {
		if (object.key.test(req.url) && object.methods.includes(req.method)) {
			found = true
			if (DEBUG) {
				console.log(object.key + ": " + object.callback);
			}

			// Add the capture-groups, to req.
			var match = object.key.exec(req.url);
			req.matches = match;

			object.callback(req, res);
		}
	});

	if (found == false) {
		error.forEach(function(object) {
			object(req, res);
		});
	}
}

