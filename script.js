const axios		= require('axios');
const cheerio	= require('cheerio');
const entities	= require('entities');
const fs		= require('fs');
const util		= require('util');

const nb_workers		= 10;
const id_start			= 176915;
const domain			= 'https://stackoverflow.com/';
const start_time		= Date.now();
const restart_interval	= 60 * 1000;
const states			= {ready: 0, busy: 1, broken: 2, restarting: 3};

const log_name		= id_start + '-' + start_time;
const log_stdout	= process.stdout;
const log_access	= fs.createWriteStream('./logs/access-' + log_name + '.log', {flags : 'w'});
const log_error		= fs.createWriteStream('./logs/error-' + log_name + '.log', {flags : 'w'});
const scrape_out	= fs.createWriteStream('./scraper-results/scraper-results-' + log_name + '.out' , {flags : 'w'});


const scraper = {
	next_id: id_start,
	feed: function() {
		args = [];
		for (var i = 0; i < 10; i++) {
			args.push({
				page_id: this.next_id + i
			});
		}
		this.next_id += i;
		return args;
	},
	explore: function($, worker) {
		var question = $('#mainbar .question .post-text').text();
		if (question)
			saveResult(JSON.stringify({
				info:		worker.id + '-' + worker.args.page_id,
				question:	question
			}) + ', ');
	},
	retry: function(error) {
		return error.response.status != 404;
	},
	getUrl: function(args) {
		return domain + 'questions/' + args.page_id;
	}
}



var logger = function(message, error, verbose) {
	var formatted = util.format(message) + '\n';

	if (!error)
		log_access.write(formatted);
	else
		log_error.write(formatted);

	if (verbose)
		log_stdout.write(util.format(message) + '\n');
};

var saveResult = function(entry) {
	scrape_out.write(entry);
};



var work = function() {
	this.worker.state = states.busy;
	axios({
		method: 'get',
		url: this.scraper.getUrl(this.worker.args),
		responseType: 'string'
	})
	.then(function(response) {
		var $ = cheerio.load(response.data);
		this.scraper.explore($, this.worker);
		logger(this.worker.id + '-' + Date.now() + ':' + 'done', false, true);
		this.worker.state = states.ready;
	}.bind(this))
	.catch(function(error) {
		logger(this.worker.id + '-' + Date.now() + ':' + 'fail:' + error.response.status + ' ' + error.response.statusText, true, true);
		this.worker.state = states.broken;
		this.worker.error = error;
	}.bind(this));
};

var initQueue = function() {
	var queue = [];
	logger(queue, false, true);
	return queue;
};

var initWorkers = function() {
	var workers = [];
	for (var i = 0; i < nb_workers; i++) {
		workers.push({
			id:		i,
			state: 	states.ready
		})
	}
	logger(workers, false, true);
	return workers;
};

var update = function(scraper, workers, queue) {
	var enqueue = function(args) {
		for (var i = 0; i < args.length; i++) {
			queue.push(args[i]);
			logger('enqueue: ' + JSON.stringify(args[i]), false, true);
		}
	};

	var dequeue = function(scraper, queue, worker) {
		worker.args = queue.shift();
		work.call({scraper: scraper, queue: queue, worker: worker});
	};


	for (var i = 0; i < workers.length; i++) {
		var worker = workers[i];
		if (worker.state == states.ready && queue.length != 0)
			dequeue(scraper, queue, worker);
		else if (worker.state == states.broken && queue.length != 0) {
			worker.state = states.restarting;
			if (!scraper.retry(worker.error))
				dequeue(scraper, queue, worker);
			else {
				logger(worker.id + '-' + Date.now() + ':wait ' + (restart_interval / 1000).toFixed(2) + 's then try again', false, true);
				setTimeout(work.bind({scraper: scraper, queue: queue, worker: worker}), restart_interval);
			}
		}
		if (queue.length == 0) {
			logger('empty queue, feeding...', false, true);
			args = scraper.feed();
			if (typeof args == 'undefined' || !args.length) {
				logger('feed fail, exit', false, true);
				process.exit();
			} else {
				enqueue(args);
			}
		}
	}
};

var entrypoint = function(scraper) {
	logger('started at ' + start_time, false, true);
	queue = initQueue();
	workers = initWorkers();
	setInterval(update.bind(null, scraper, workers, queue), 250);
};

entrypoint(scraper);