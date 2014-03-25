'use strict';

var exchangeData = {};
var exch = require('./lib/exchange');
var nocklib = require('./lib/nocklib');
var nockroutes = require('./routes/nockroutes');
var db = require('./lib/db');
var express = require('express');
var timeFloor = 500;
var timeRange = 1000;

var stocks = ['NOCK1', 'NOCK2', 'NOCK3', 'NOCK4', 'NOCK5'];
var allData = [];
stocks.forEach(function(stock) { allData.push({}) });

function submitRandomOrder(index) {
	var exchangeData = allData[index];
	var ord = nocklib.generateRandomOrder(exchangeData);
	ord.stock = stocks[index];
	if (ord.type == exch.BUY)
		allData[index] = exch.buy(ord.price, ord.volume, exchangeData);
	else
		allData[index] = exch.sell(ord.price, ord.volume, exchangeData);

	db.insertOne('transactions', ord, function(err, order) {
		if (exchangeData.trades && exchangeData.trades.length > 0) {
			nocklib.sendTrades(exchangeData.trades);

			var trades = exchangeData.trades.map(function(trade) {
				trade.init = (ord.type == exch.BUY) ? 'b' : 's';
				trade.stock = stocks[index];
				return trade;
			});
			db.insert('transactions', trades, function(err, trades) {
				pauseThenTrade();
			});
		} else {
			pauseThenTrade();
		}
	});

	function pauseThenTrade() {
		var pause = Math.floor(Math.random() * timeRange) + timeFloor;
		setTimeout(submitRandomOrder.bind(this, index), pause);
	}
}

var app = express.createServer();
app.configure(function() {
	app.use(express.bodyParser());
	app.use(express.cookieParser());
	app.use(express.session({secret: 'secretpasswordforsessions', store: nocklib.getSessionStore()}));
	app.set('views', __dirname + '/views');
	app.set('view engine', 'ejs');
	app.use(express.static(__dirname + '/public'));
});
app.set('view options', {
	layout: false
});

app.get('/', nockroutes.getIndex);
app.post('/signup', nockroutes.signup);
app.post('/login', nockroutes.login);
app.post('/add-stock', nockroutes.addStock);

app.get('/portfolio', nocklib.ensureAuthenticated, nockroutes.portfolio);

app.get('/api/users/:username', nockroutes.getUser);
app.get('/api/trades', function(req, res) {
	db.find('transactions', { init: { $exists: true } }, 100, function(err, trades) {
			if (err) console.error(err); return;
			var json = [];
			var lastTime = 0;
			trades.reverse().forEach(function(trade) {
				var date = new Date(parseInt(trade._id.toString().substring(0,8), 16) * 1000);
				var dataPoint = [date.getTime(), trade.price];
				if (date - lastTime > 1000) json.push(dataPoint);
				lastTime = date;
			});
			res.json(json);
	});
});

db.open(function() {
	app.listen(5000);
	nocklib.createSocket(app);
	for (var i=0; i < stocks.length; i++) {
		submitRandomOrder(i);
	}
	console.log('Listening on port 5000');
});
