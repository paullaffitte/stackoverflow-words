const fs = require('fs');
const util = require('util');

var removeSpecialChars = function(str) {
	return str.replace(/(~|`|!|@|#|$|%|^|&|\*|\(|\)|{|}|\[|\]|;|:|\"|'|<|,|\.|>|\?|\/|\\|\||-|_|\+|=|\n|\t)/g, ' ').replace(/\s+/g, ' ')
}

if (process.argv.length != 3)
	return;

var filename = process.argv[2];
var readStream = fs.createReadStream(filename, 'utf8');
var data = '';
var stats = {words: {}, totalWords: 0};

readStream.on('data', function(chunk) {  
	data += chunk;
}).on('end', function() {
	data = JSON.parse('[' + data + ']');
	console.log(data.length + ' entries');
	for (var i = 0; i < data.length; i++) {
		var entry = data[i];
		entry.question = removeSpecialChars(entry.question).trim();
		words = entry.question.split(' ');
		stats.totalWords += words.length;
		for (var j = 0; j < words.length; j++) {
			if (typeof stats.words[words[j]] == 'undefined')
				stats.words[words[j]] = 1;
			else 
				stats.words[words[j]]++;
		}
	}
	var tmp = [];
	Object.keys(stats.words).map(function(key) {
	   tmp.push({word: key, count: stats.words[key], percent: (stats.words[key] / stats.totalWords * 100).toFixed(3) + '%'});
	});
	stats.words = tmp;
	stats.words.sort(function(a, b) {
		return a.count - b.count;
	});
	for (var i = 0; i < stats.words.length; i++) {
		console.log(stats.words[i].percent + '\t' + stats.words[i].count + '\t' + stats.words[i].word);
	}
}).on('error', function(error) {
	console.log(error);
});