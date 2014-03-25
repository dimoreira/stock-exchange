'use strict';

var cookie = require('cookie');
var crypto = require('crypto');
var db = require('./db');
var exchange = require('./exchange');
var http = require('http');
var MemoryStore = require('express').session.MemoryStore;
var ObjectID = require('mongodb').ObjectID;
var priceFloor = 35;
var priceRange = 10;
var volFloor = 80;
var volRange = 40;

var io;
var sessionStore = new MemoryStore();
var online = [];

module.exports = {
	authenticate: function(username, password, callback) {
		db.findOne('users', {username: username}, function(err, user) {
			if (user && (user.password === encryptPassword(password)))
				callback(err, user._id);
			else
				callback(err, null);
		});
	},
	createSocket: function(app) {
		io = require('socket.io').listen(app);
		io.configure(function() {
			io.set('authorization', function(handshakeData, callback) {
				if (handshakeData.headers.cookie) {
					handshakeData.cookie = cookie.parse(decodeURIComponent(handshakeData.headers.cookie));
					handshakeData.sessionID = handshakeData.cookie['connect.sid'];
					sessionStore.get(handshakeData.sessionID, function(err, session) {
						if (err || !session) {
							return callback(null, false);
						} else {
							handshakeData.session = session;
							console.log('session data', session);
							return callback(null, true);
						}
					});
				} else {
					return callback(null, false);
				}
			});

			io.sockets.on('connection', function(socket) {
				socket.on('joined', function(data) {
					online.push(socket.handshake.session.username);
					var message = 'Admin: ' + socket.handshake.session.username + ' has joined\n';
					socket.emit('chat', { message: message, users: online });
					socket.broadcast.emit('chat', { message: message, username: socket.handshake.session.username });
				});

				socket.on('updateAccount', function(data) {
					module.exports.updateEmail(socket.handshake.session._id, data.email, function(err, numUpdates) {
						socket.emit('updateSuccess', {});
					});
				});

				socket.on('clientchat', function(data) {
					var message = socket.handshake.session.username + ': ' + data.message + '\n';
					socket.emit('chat', { message: message });
					socket.broadcast.emit('chat', { message: message });
				});

				socket.on('disconnect', function(data) {
					var username = socket.handshake.session.username;
					var index = online.indexOf(username);
					online.splice(index, 1);
					socket.broadcast.emit('disconnect', { username: username });
				});
			});
		});
	},
	createUser: function(username, email, password, callback) {
		var user = {
			username: username,
			email: email,
			password: encryptPassword(password)
		}
		db.insertOne('users', user, callback);
	},
	ensureAuthenticated: function(req, res, next) {
		if (req.session._id)
			return next();
		res.redirect('/');
	},
	generateRandomOrder: function(exchangeData) {
		var order = {};
		if (Math.random() > 0.5) order.type = exchange.BUY;
		else order.type = exchange.SELL;

		var buyExists = exchangeData.buys && exchangeData.buys.prices.peek();
		var sellExists = exchangeData.sells && exchangeData.sells.prices.peek();
		var ran = Math.random();

		if (!buyExists && !sellExists)
			order.price = Math.floor(ran * priceRange) + priceFloor;
		else if (buyExists && sellExists) {
			if (Math.random() > 0.5)
				order.price = exchangeData.buys.prices.peek();
			else
				order.price = exchangeData.sells.prices.peek();
		} else if (buyExists) {
			order.price = exchangeData.buys.prices.peek();
		} else {
			order.price = exchangeData.sells.prices.peek();
		}

		var shift = Math.floor(Math.random() * priceRange / 2);

		if (Math.random() > 0.5) order.price += shift;
		else order.price -= shift;
		order.volume = Math.floor(Math.random() * volRange) + volFloor;

		return order;
	},
	getUserById: function(id, callback) {
		db.findOne('users', {_id: new ObjectID(id)}, callback);
	},
	getUser: function(username, callback) {
		db.findOne('users', {username: username}, callback);
	},
	getSessionStore: function() {
		return sessionStore;
	},
	getStockPrices: function(stocks, callback) {
		var stockList = '';
		stocks.forEach(function(stock) {
			stockList += stock + ',';
		});

		var options = {
			host: 'download.finance.yahoo.com',
			port: 80,
			path: '/d/quotes.csv?s=' + stockList + '&f=sl1c1d1&e=.csv'
		};

		http.get(options, function(res) {
			var data = '';
			res.on('data', function(chunk) {
				data += chunk.toString();
			})
			.on('error', function(err) {
				console.error('Error retrieving Yahoo stock prices');
				throw err;
			})
			.on('end', function() {
				var tokens = data.split('\r\n');
				var prices = [];
				tokens.forEach(function(line) {
					var price = line.split(',')[1];
					if (price)
						prices.push(price);
				});
				callback(null, prices);
			});
		});
	},
	addStock: function(uid, stock, callback) {
		function doCallback() {
			counter++;
			if (counter == 2) {
				callback(null, price);
			}
		}

		var counter = 0;
		var price;
		module.exports.getStockPrices([stock], function(err, retrieved) {
			price = retrieved[0];
			doCallback();
		});
		db.push('users', new ObjectID(uid), {portfolio: stock}, doCallback);
	},
	sendTrades: function(trades) {
		io.sockets.emit('trade', JSON.stringify(trades));
	},
	updateEmail: function(id, email, callback) {
		db.updateById('users', new ObjectID(id), {email: email}, callback);
	}
}

function encryptPassword(plainText) {
	return crypto.createHash('md5').update(plainText).digest('hex');
}